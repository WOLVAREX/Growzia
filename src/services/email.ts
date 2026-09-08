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
  return `<!doctype html><html><body style="margin:0;background:#f4f4f1;font-family:Arial,Helvetica,sans-serif;color:#171717"><div style="max-width:640px;margin:32px auto;padding:0 16px"><div style="background:#111;color:#fff;border-radius:16px 16px 0 0;padding:24px 28px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b9b9b3">GROWZIA</div><h1 style="margin:12px 0 0;font-size:26px;line-height:1.2">${title}</h1></div><div style="background:#fff;border:1px solid #e1e1db;border-top:0;border-radius:0 0 16px 16px;padding:28px;line-height:1.7;font-size:15px">${body}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #ecece7;color:#777;font-size:12px">Grow your social presence. Simply.</div></div></div></body></html>`;
}
