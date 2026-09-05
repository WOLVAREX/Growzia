import { env } from "../../lib/env";
import {
  toFiniteNumber,
  toTrimmedString,
  type ProviderClient,
  type ProviderOrderResult,
  type ProviderStatusResult,
  type RawProviderService,
} from "./types";

interface BwmEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { message?: string } | string;
}

interface BwmRawService {
  id?: string | number;
  service_id?: string | number;
  name?: string;
  category?: string;
  price_per_1000_ksh?: string | number;
  min?: string | number;
  max?: string | number;
}

interface BwmOrderData {
  order_id?: string | number;
  status?: string;
}

interface BwmStatusData {
  status?: string;
  quantity?: string | number;
  remains?: string | number;
  start_count?: string | number;
}

function extractError(payload: BwmEnvelope<unknown> | null, status: number): string {
  if (payload && payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.error.message === "string") return payload.error.message;
  }
  return `Upstream request failed (${status})`;
}

async function callBwm<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = env.BWM_API_URL.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${env.BWM_API}`,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
    signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as BwmEnvelope<T> | null;
  if (!response.ok || !payload || payload.success === false) {
    throw new Error(extractError(payload, response.status));
  }
  if (payload.data === undefined || payload.data === null) {
    throw new Error("Upstream returned an empty response");
  }
  return payload.data;
}

export const bwmClient: ProviderClient = {
  code: "bwm",

  async fetchServices(): Promise<RawProviderService[]> {
    const data = await callBwm<BwmRawService[]>("/services", { method: "GET" });
    if (!Array.isArray(data)) throw new Error("Upstream returned an invalid service catalogue");

    const services: RawProviderService[] = [];
    for (const item of data) {
      const providerServiceId = toTrimmedString(item.id ?? item.service_id);
      const name = toTrimmedString(item.name);
      const rate = toFiniteNumber(item.price_per_1000_ksh, -1);
      if (!providerServiceId || !name || rate < 0) continue;
      services.push({
        providerCode: "bwm",
        providerServiceId,
        name,
        category: toTrimmedString(item.category, "General"),
        rawRate: rate,
        rawCurrency: "KES",
        baseKesPer1000: rate,
        min: Math.max(1, Math.floor(toFiniteNumber(item.min, 1))),
        max: Math.max(1, Math.floor(toFiniteNumber(item.max, 1))),
      });
    }
    return services;
  },

  async placeOrder(serviceId: string | number, link: string, quantity: number): Promise<ProviderOrderResult> {
    const numericId = toFiniteNumber(serviceId, NaN);
    const data = await callBwm<BwmOrderData>("/services/order", {
      method: "POST",
      body: JSON.stringify({
        service_id: Number.isFinite(numericId) ? numericId : String(serviceId),
        provider: "bwm",
        link,
        quantity,
      }),
    });
    const providerOrderId = toTrimmedString(data.order_id);
    if (!providerOrderId) throw new Error("Upstream did not return an order reference");
    return { providerOrderId, status: toTrimmedString(data.status, "pending") };
  },

  async getOrderStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    const data = await callBwm<BwmStatusData>(`/services/order/${encodeURIComponent(providerOrderId)}`, {
      method: "GET",
    });
    const result: ProviderStatusResult = { status: toTrimmedString(data.status, "pending") };
    if (data.remains !== undefined) result.remains = toFiniteNumber(data.remains, 0);
    if (data.start_count !== undefined) result.startCount = toFiniteNumber(data.start_count, 0);
    return result;
  },
};
