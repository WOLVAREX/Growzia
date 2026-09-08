import { env } from "../lib/env";
import { serviceUnavailable } from "../lib/httpError";
import { errorMessage, logger } from "../lib/logger";
import { getProviderAlertNumbers, getProviderAlertSenderId } from "./settings";
import { User } from "../models/User";
import { emailLayout, sendEmailInBackground } from "./email";

export interface NenaSenderId {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  isUsedForAll: boolean;
}

function normalizeKenyanRecipient(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(compact)) return `254${compact.slice(1)}`;
  if (/^\+254[17]\d{8}$/.test(compact)) return compact.slice(1);
  return compact;
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
  const normalizedRecipient = normalizeKenyanRecipient(recipient);
  const response = await fetch(env.NENA_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NENA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender_id: senderId, to: normalizedRecipient, message }),
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
    const suffix = detail === "recipient_invalid" ? "The number was rejected by Nena. Verify that it is an active Kenyan mobile number." : detail;
    throw serviceUnavailable(`Nena SMS failed (${response.status}): ${suffix}`);
  }
}

export async function sendProviderAlert(message: string): Promise<void> {
  const admins = await User.find({ isAdmin: true, isBanned: false }).select("email username").lean().exec();
  for (const admin of admins) {
    sendEmailInBackground({
      to: admin.email,
      subject: "Growzia provider top-up needed",
      html: emailLayout("Provider top-up needed", `<p>Hi ${admin.username},</p><p>${message}</p><p>Please top up the provider account so queued orders can continue.</p>`),
    });
  }
  if (!env.NENA_API_KEY) return;
  const numbers = await getProviderAlertNumbers();
  if (numbers.length === 0) return;
  const configuredSenderId = await getProviderAlertSenderId();
  const senderId = configuredSenderId || (await listNenaSenderIds()).find((sender) => sender.isActive)?.id || "";
  if (!senderId) {
    logger.warn("Provider alert SMS skipped: no active Nena sender UUID configured");
    return;
  }
  const results = await Promise.allSettled(numbers.map((recipient) => sendNenaSms(recipient, senderId, message)));
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.warn(`Provider alert SMS failed for ${numbers[index]}: ${errorMessage(result.reason)}`);
  });
  logger.info(`Provider alert SMS fan-out attempted for ${numbers.length} recipient(s)`);
}

export function sendProviderAlertInBackground(message: string): void {
  void sendProviderAlert(message).catch((error) => logger.warn(`Provider alert SMS skipped: ${errorMessage(error)}`));
}
