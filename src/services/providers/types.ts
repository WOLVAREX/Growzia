export type ProviderCode = "bwm" | "cheapgains";

export interface RawProviderService {
  providerCode: ProviderCode;
  providerServiceId: string;
  name: string;
  category: string;
  rawRate: number;
  rawCurrency: string;
  baseKesPer1000: number;
  min: number;
  max: number;
}

export interface ProviderOrderResult {
  providerOrderId: string;
  status?: string;
}

export interface ProviderStatusResult {
  status: string;
  remains?: number;
  startCount?: number;
  charge?: number;
}

export interface ProviderClient {
  code: ProviderCode;
  fetchServices(): Promise<RawProviderService[]>;
  placeOrder(serviceId: string | number, link: string, quantity: number): Promise<ProviderOrderResult>;
  getOrderStatus(providerOrderId: string): Promise<ProviderStatusResult>;
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function toTrimmedString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
