import { env } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";

type EmailInput = { to: string; subject: string; html: string; text?: string };

export async function sendEmail(input: EmailInput): Promise<void> {
  if (!env.BREVO_API_KEY || !env.SENDER_EMAIL) throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL }, to: [{ email: input.to }], subject: input.subject, htmlContent: input.html, textContent: input.text }),
  });
  if (!response.ok) throw new Error(`Brevo rejected email (${response.status})`);
}

export function sendEmailInBackground(input: EmailInput): void {
  void sendEmail(input).catch((error: unknown) => logger.warn(`Email delivery failed: ${errorMessage(error)}`));
}

export function emailLayout(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#171717"><h2>${title}</h2>${body}<p style="color:#777;font-size:12px">Growzia</p></div>`;
}
