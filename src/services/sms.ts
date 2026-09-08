import { env } from "../lib/env";
import { serviceUnavailable } from "../lib/httpError";
import { errorMessage, logger } from "../lib/logger";
import { getProviderAlertNumbers, getProviderAlertSenderId } from "./settings";

export interface NenaSenderId {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  isUsedForAll: boolean;
}

export async function listNenaSenderIds(): Promise<NenaSenderId[]> {
  if (!env.NENA_API_KEY) return [];
  try {
    const response = await fetch("https://nenasolutions.co.ke/v1/api/sender-ids", {
      headers: { Authorization: `Bearer ${env.NENA_API_KEY}`, Accept: "application/json" },
      signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Nena sender list rejected (${response.status})`);
    const payload = await response.json() as { data?: Array<Record<string, unknown>> };
    return (payload.data ?? []).flatMap((item) => {
      if (typeof item.id !== "string" || typeof item.value !== "string") return [];
      return [{ id: item.id, value: item.value, label: typeof item.label === "string" ? item.label : item.value, isActive: item.is_active === true, isUsedForAll: item.is_used_for_all === true }];
    });
  } catch (error) {
    logger.warn(`Nena sender list unavailable: ${errorMessage(error)}`);
    return [];
  }
}

export async function sendNenaSms(recipient: string, senderId: string, message: string): Promise<void> {
  if (!env.NENA_API_KEY) throw serviceUnavailable("Nena SMS is not configured on the server");
  const response = await fetch(env.NENA_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NENA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender_id: senderId, recipient, phone: recipient, message }),
    signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail = "The SMS provider rejected the request";
    try {
      const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown; detail?: unknown };
      const nestedCode = parsed.error && typeof parsed.error === "object" ? (parsed.error as { code?: unknown }).code : undefined;
      const providerMessage = parsed.message ?? parsed.detail ?? nestedCode ?? (typeof parsed.error === "string" ? parsed.error : undefined);
      if (typeof providerMessage === "string" && providerMessage.trim()) detail = providerMessage.trim().slice(0, 240);
    } catch {
      if (raw.trim()) detail = raw.trim().replace(/\s+/g, " ").slice(0, 240);
    }
    throw serviceUnavailable(`Nena SMS failed (${response.status}): ${detail}`);
  }
}

export async function sendProviderAlert(message: string): Promise<void> {
  if (!env.NENA_API_KEY) return;
  const numbers = await getProviderAlertNumbers();
  if (numbers.length === 0) return;
  const senderId = await getProviderAlertSenderId();
  for (const recipient of numbers) {
    try {
      await sendNenaSms(recipient, senderId, message);
    } catch (error) {
      logger.warn(`Provider alert SMS failed for ${recipient}: ${errorMessage(error)}`);
    }
  }
}

export function sendProviderAlertInBackground(message: string): void {
  void sendProviderAlert(message).catch((error) => logger.warn(`Provider alert SMS skipped: ${errorMessage(error)}`));
}
