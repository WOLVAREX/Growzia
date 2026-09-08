import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { env } from "../lib/env";
import { badRequest, notFound, unauthorized } from "../lib/httpError";
import { logger } from "../lib/logger";
import { Payment, type PaymentDoc } from "../models/Payment";
import { User } from "../models/User";
import { emailLayout, sendEmailInBackground } from "./email";
type PaystackResponse = { status: boolean; message: string; data?: { authorization_url?: string; access_code?: string; id?: number; status?: string; display_text?: string } };
function requireKey(): string { if (!env.PAYSTACK_SECRET_KEY) throw badRequest("Paystack payments are not configured yet"); return env.PAYSTACK_SECRET_KEY; }
async function createPayment(userId: string, amountKes: number, email: string, method: "card" | "mpesa") {
  const amount = Math.round(amountKes * 100); if (!Number.isFinite(amount) || amount < 100) throw badRequest("Minimum wallet funding amount is KES 1");
  const reference = `gw_${randomUUID().replaceAll("-", "")}`; const payment = await Payment.create({ userId: new Types.ObjectId(userId), reference, amountKes, currency: env.PAYSTACK_CURRENCY, method, status: "pending" });
  try { const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: String(amount), email, currency: env.PAYSTACK_CURRENCY, channels: ["card"], reference, ...(env.PAYSTACK_CALLBACK_URL ? { callback_url: env.PAYSTACK_CALLBACK_URL } : {}), metadata: JSON.stringify({ paymentId: String(payment._id), userId }) }) }); const data = (await response.json()) as PaystackResponse; if (!response.ok || !data.status || !data.data?.authorization_url || !data.data.access_code) throw new Error(data.message || "Paystack initialization failed"); return { reference, authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code, amountKes }; }
  catch (error) { payment.status = "failed"; payment.gatewayResponse = error instanceof Error ? error.message : "Paystack initialization failed"; await payment.save(); if (error instanceof Error && error.message === "Paystack payments are not configured yet") throw error; throw badRequest("Unable to initialize payment"); }
}
export async function initializePaystackPayment(userId: string, amountKes: number, email: string) { return createPayment(userId, amountKes, email, "card"); }
export async function initializeMpesaPayment(userId: string, amountKes: number, email: string, phone: string) {
  const amount = Math.round(amountKes * 100); if (!Number.isFinite(amount) || amount < 100) throw badRequest("Minimum wallet funding amount is KES 1");
  const reference = `gw_${randomUUID().replaceAll("-", "")}`; const payment = await Payment.create({ userId: new Types.ObjectId(userId), reference, amountKes, currency: env.PAYSTACK_CURRENCY, method: "mpesa", status: "pending" });
  try { const response = await fetch("https://api.paystack.co/charge", { method: "POST", headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: String(amount), email, currency: env.PAYSTACK_CURRENCY, reference, mobile_money: { phone, provider: "mpesa" }, metadata: { paymentId: String(payment._id), userId } }) }); const data = (await response.json()) as PaystackResponse; if (!response.ok || !data.status) throw new Error(data.message || "M-Pesa charge failed"); return { reference, status: data.data?.status || "pay_offline", displayText: data.data?.display_text || data.message, amountKes }; }
  catch (error) { payment.status = "failed"; payment.gatewayResponse = error instanceof Error ? error.message : "M-Pesa charge failed"; await payment.save(); if (error instanceof Error && error.message === "Paystack payments are not configured yet") throw error; throw badRequest("Unable to send M-Pesa prompt"); }
}
// Shared, idempotent credit step. Guarded by the { status: "pending" } filter in the
// update itself, so it's safe to call this from both the manual verify endpoint and the
// webhook for the same payment without ever double-crediting a balance.
async function creditPendingPayment(
  payment: PaymentDoc,
  paystackTransactionId: string | null,
  gatewayResponse: string | null,
): Promise<PaymentDoc | null> {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    { $set: { status: "success", paystackTransactionId, creditedAt: new Date(), gatewayResponse } },
    { new: true },
  ).exec();
  if (!updated) return null; // someone else (webhook or verify call) already credited this one

  await User.updateOne({ _id: payment.userId }, { $inc: { balanceKes: payment.amountKes } }).exec();
  const recipient = await User.findById(payment.userId).select("email username").lean().exec();
  if (recipient) {
    sendEmailInBackground({
      to: recipient.email,
      subject: "Growzia payment receipt",
      html: emailLayout(
        "Payment received",
        `<p>Hi ${recipient.username}, your wallet has been credited with <strong>KES ${payment.amountKes.toFixed(2)}</strong>.</p><p>Reference: ${payment.reference}</p>`,
      ),
    });
  }
  return updated;
}

export async function verifyPaystackPayment(userId: string, reference: string) {
  const payment = await Payment.findOne({ userId, reference }).exec(); if (!payment) throw notFound("Payment not found"); if (payment.status === "success") return payment;
  const verifyUrl = payment.method === "mpesa" ? `https://api.paystack.co/charge/${encodeURIComponent(reference)}` : `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`; const response = await fetch(verifyUrl, { headers: { Authorization: `Bearer ${requireKey()}` } }); const data = (await response.json()) as PaystackResponse; const successful = response.ok && data.status && data.data?.status === "success";
  if (!successful) { payment.status = data.data?.status === "failed" ? "failed" : "pending"; payment.gatewayResponse = data.message || "Payment not successful"; await payment.save(); return payment; }
  const updated = await creditPendingPayment(payment, data.data?.id ? String(data.data.id) : null, data.message ?? null);
  return updated ?? (await Payment.findById(payment._id).exec());
}

/**
 * Verifies the `x-paystack-signature` header against the raw request body using
 * PAYSTACK_SECRET_KEY (Paystack signs webhook payloads with HMAC-SHA512). This MUST run
 * against the exact raw bytes Paystack sent — the parsed/re-stringified JSON body will not
 * produce a matching signature. See app.ts, which captures req.rawBody for this purpose.
 */
export function verifyPaystackWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

interface PaystackWebhookEvent {
  event?: string;
  data?: { reference?: string; status?: string; id?: number };
}

/**
 * Handles an incoming Paystack webhook call. This is the reliable path for crediting
 * balances: it fires server-to-server the moment Paystack confirms a charge, regardless of
 * whether the customer's browser is still open (unlike the manual /verify endpoint, which
 * depends on the frontend calling it after the fact).
 */
export async function handlePaystackWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<void> {
  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    throw unauthorized("Invalid webhook signature");
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as PaystackWebhookEvent;
  } catch {
    throw badRequest("Invalid webhook payload");
  }

  const reference = event.data?.reference;
  if (!reference) return;

  if (event.event !== "charge.success") {
    logger.info(`Paystack webhook: unhandled event "${event.event ?? "unknown"}" for ${reference}`);
    return;
  }

  const payment = await Payment.findOne({ reference }).exec();
  if (!payment) {
    logger.warn(`Paystack webhook: no payment found for reference ${reference}`);
    return;
  }
  if (payment.status === "success") return; // already credited, nothing to do

  await creditPendingPayment(payment, event.data?.id ? String(event.data.id) : null, "Confirmed via Paystack webhook");
  logger.info(`Paystack webhook: credited payment ${reference}`);
}
