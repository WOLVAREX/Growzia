import { env } from "../lib/env";

export interface CurrencyDefinition {
  code: string;
  symbol: string;
  perKes: number;
}

function buildCurrencyTable(): CurrencyDefinition[] {
  const usdPerKes = 1 / env.USD_TO_KES;
  return [
    { code: "KES", symbol: "KSh", perKes: 1 },
    { code: "USD", symbol: "$", perKes: usdPerKes },
    { code: "GHS", symbol: "GH₵", perKes: usdPerKes * 15.5 },
    { code: "NGN", symbol: "₦", perKes: usdPerKes * 1550 },
    { code: "TZS", symbol: "TSh", perKes: usdPerKes * 2650 },
    { code: "UGX", symbol: "USh", perKes: usdPerKes * 3750 },
    { code: "ZAR", symbol: "R", perKes: usdPerKes * 18.5 },
    { code: "INR", symbol: "₹", perKes: usdPerKes * 86 },
    { code: "PKR", symbol: "₨", perKes: usdPerKes * 280 },
  ];
}

const currencyTable: CurrencyDefinition[] = buildCurrencyTable();
const currencyIndex = new Map<string, CurrencyDefinition>(currencyTable.map((item) => [item.code, item]));

export function listCurrencies(): CurrencyDefinition[] {
  return currencyTable.map((item) => ({ ...item }));
}

export function isSupportedCurrency(currencyCode: string): boolean {
  return currencyIndex.has(String(currencyCode || "").trim().toUpperCase());
}

export function resolveCurrency(currencyCode?: string | null): CurrencyDefinition {
  const code = String(currencyCode || env.DEFAULT_CURRENCY).trim().toUpperCase();
  const found = currencyIndex.get(code);
  if (found) return found;
  const fallback = currencyIndex.get("KES");
  if (!fallback) throw new Error("Currency table is not configured");
  return fallback;
}

export function roundMoney(amount: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function sellPrice(baseKesPer1000: number, marginPercent: number): number {
  const base = Number.isFinite(baseKesPer1000) ? Math.max(0, baseKesPer1000) : 0;
  const margin = Number.isFinite(marginPercent) ? Math.max(0, marginPercent) : 0;
  return roundMoney(base * (1 + margin / 100));
}

export function convertFromKes(amountKes: number, currencyCode: string): number {
  const currency = resolveCurrency(currencyCode);
  const amount = Number.isFinite(amountKes) ? amountKes : 0;
  return roundMoney(amount * currency.perKes);
}

export function convertToKes(amount: number, currencyCode: string): number {
  const currency = resolveCurrency(currencyCode);
  const value = Number.isFinite(amount) ? amount : 0;
  if (currency.perKes <= 0) return 0;
  return roundMoney(value / currency.perKes, 6);
}

export function quantityCostKes(sellKesPer1000: number, quantity: number): number {
  const rate = Number.isFinite(sellKesPer1000) ? Math.max(0, sellKesPer1000) : 0;
  const qty = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return roundMoney((rate * qty) / 1000);
}
