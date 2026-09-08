import { env } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";
import { getProviderAlertNumbers, getProviderAlertSenderId } from "./settings";

export async function sendNenaSms(recipient: string, senderId: string, message: string): Promise<void> {
  if (!env.NENA_API_KEY) throw new Error("Nena SMS is not configured");
  const response = await fetch(env.NENA_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NENA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender_id: senderId, recipient, phone: recipient, message }),
    signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Nena rejected SMS (${response.status})`);
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
