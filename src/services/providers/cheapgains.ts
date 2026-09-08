import { env } from "../../lib/env";
import { convertToKes } from "../pricing";
import {
  toFiniteNumber,
  toTrimmedString,
  type ProviderClient,
  type ProviderOrderResult,
  type ProviderStatusResult,
  type RawProviderService,
} from "./types";

interface CheapGainsRawService {
  service?: string | number;
  name?: string;
  category?: string;
  rate?: string | number;
  min?: string | number;
  max?: string | number;
}

interface CheapGainsOrderResponse {
  order?: string | number;
  error?: string;
}

interface CheapGainsStatusResponse {
  charge?: string | number;
  start_count?: string | number;
  status?: string;
  remains?: string | number;
  currency?: string;
  error?: string;
}

interface CheapGainsBalanceResponse {
  balance?: string | number;
  currency?: string;
  error?: string;
}

async function callCheapGains<T>(params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams({ key: env.CHEAPGAINS_API_KEY });
  for (const [key, value] of Object.entries(params)) body.append(key, String(value));

  const response = await fetch(env.CHEAPGAINS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`Upstream request failed (${response.status})`);
  }
  if (!Array.isArray(payload)) {
    const maybeError = (payload as { error?: unknown }).error;
    if (typeof maybeError === "string" && maybeError.trim() !== "") throw new Error(maybeError);
  }
  return payload;
}

export const cheapGainsClient: ProviderClient = {
  code: "cheapgains",

  async fetchServices(): Promise<RawProviderService[]> {
    const data = await callCheapGains<CheapGainsRawService[]>({ action: "services" });
    if (!Array.isArray(data)) throw new Error("Upstream returned an invalid service catalogue");

    const accountCurrency = env.CHEAPGAINS_ACCOUNT_CURRENCY.toUpperCase();
    const services: RawProviderService[] = [];
    for (const item of data) {
      const providerServiceId = toTrimmedString(item.service);
      const name = toTrimmedString(item.name);
      const rate = toFiniteNumber(item.rate, -1);
      if (!providerServiceId || !name || rate < 0) continue;
      services.push({
        providerCode: "cheapgains",
        providerServiceId,
        name,
        category: toTrimmedString(item.category, "General"),
        rawRate: rate,
        rawCurrency: accountCurrency,
        baseKesPer1000: convertToKes(rate, accountCurrency),
        min: Math.max(1, Math.floor(toFiniteNumber(item.min, 1))),
        max: Math.max(1, Math.floor(toFiniteNumber(item.max, 1))),
      });
    }
    return services;
  },

  async placeOrder(serviceId: string | number, link: string, quantity: number): Promise<ProviderOrderResult> {
    const data = await callCheapGains<CheapGainsOrderResponse>({
      action: "add",
      service: String(serviceId),
      link,
      quantity,
    });
    const providerOrderId = toTrimmedString(data.order);
    if (!providerOrderId) throw new Error("Upstream did not return an order reference");
    return { providerOrderId, status: "pending" };
  },

  async getOrderStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    const data = await callCheapGains<CheapGainsStatusResponse>({ action: "status", order: providerOrderId });
    const result: ProviderStatusResult = { status: toTrimmedString(data.status, "pending") };
    if (data.remains !== undefined) result.remains = toFiniteNumber(data.remains, 0);
    if (data.start_count !== undefined) result.startCount = toFiniteNumber(data.start_count, 0);
    if (data.charge !== undefined) result.charge = toFiniteNumber(data.charge, 0);
    return result;
  },

  async getBalanceKes() {
    return fetchCheapGainsBalanceKes();
  },
};

export async function fetchCheapGainsBalanceKes(): Promise<{ balanceKes: number; currency: string }> {
  const data = await callCheapGains<CheapGainsBalanceResponse>({ action: "balance" });
  const currency = toTrimmedString(data.currency, env.CHEAPGAINS_ACCOUNT_CURRENCY).toUpperCase();
  return { balanceKes: convertToKes(toFiniteNumber(data.balance, 0), currency), currency };
}
