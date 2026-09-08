import { AppSettings } from "../models/AppSettings";
import { env } from "../lib/env";

export const SETTING_KEYS = {
  maintenanceMode: "maintenanceMode",
  marginPercent: "marginPercent",
  disabledServices: "disabledServices",
  disabledProviderServices: "disabledProviderServices",
  orderProcessingHours: "orderProcessingHours",
  providerAlertNumbers: "providerAlertNumbers",
  providerAlertSenderId: "providerAlertSenderId",
} as const;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 15000;
const cache = new Map<string, CacheEntry>();

async function readSetting(key: string): Promise<unknown> {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const doc = await AppSettings.findOne({ key }).lean().exec();
  const value = doc ? doc.value : undefined;
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await AppSettings.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true, new: true }).exec();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearSettingsCache(): void {
  cache.clear();
}

export async function getMaintenanceMode(): Promise<boolean> {
  const value = await readSetting(SETTING_KEYS.maintenanceMode);
  return value === true;
}

export async function setMaintenanceMode(enabled: boolean): Promise<boolean> {
  await writeSetting(SETTING_KEYS.maintenanceMode, enabled);
  return enabled;
}

export async function getMarginPercent(): Promise<number> {
  const value = await readSetting(SETTING_KEYS.marginPercent);
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return env.DEFAULT_MARGIN_PERCENT;
}

export async function setMarginPercent(marginPercent: number): Promise<number> {
  const value = Math.max(0, Number(marginPercent));
  await writeSetting(SETTING_KEYS.marginPercent, value);
  return value;
}

export async function getDisabledServices(): Promise<string[]> {
  const value = await readSetting(SETTING_KEYS.disabledServices);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function setDisabledServices(keys: string[]): Promise<string[]> {
  const unique = Array.from(new Set(keys.map((key) => String(key).trim()).filter((key) => key !== "")));
  await writeSetting(SETTING_KEYS.disabledServices, unique);
  return unique;
}

export async function getDisabledProviderServices(): Promise<string[]> {
  const value = await readSetting(SETTING_KEYS.disabledProviderServices);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function setDisabledProviderServices(keys: string[]): Promise<string[]> {
  const unique = Array.from(new Set(keys.map((key) => String(key).trim()).filter((key) => key !== "")));
  await writeSetting(SETTING_KEYS.disabledProviderServices, unique);
  return unique;
}

export async function getOrderProcessingHours(): Promise<number> {
  const value = await readSetting(SETTING_KEYS.orderProcessingHours);
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 24;
}

export async function setOrderProcessingHours(hours: number): Promise<number> {
  const value = Math.min(168, Math.max(0, Number(hours)));
  await writeSetting(SETTING_KEYS.orderProcessingHours, value);
  return value;
}

export async function getProviderAlertNumbers(): Promise<string[]> {
  const value = await readSetting(SETTING_KEYS.providerAlertNumbers);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function setProviderAlertNumbers(numbers: string[]): Promise<string[]> {
  const unique = Array.from(new Set(numbers.map((number) => String(number).trim()).filter(Boolean)));
  await writeSetting(SETTING_KEYS.providerAlertNumbers, unique);
  return unique;
}

export async function getProviderAlertSenderId(): Promise<string> {
  const value = await readSetting(SETTING_KEYS.providerAlertSenderId);
  return typeof value === "string" && value.trim() ? value.trim() : env.NENA_SENDER_ID;
}

export async function setProviderAlertSenderId(senderId: string): Promise<string> {
  const value = senderId.trim();
  await writeSetting(SETTING_KEYS.providerAlertSenderId, value);
  return value;
}
