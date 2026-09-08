import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { unauthorized } from "../lib/httpError";
import { requireAuth } from "../middleware/auth";
import { handlePaystackWebhookEvent, initializeMpesaPayment, initializePaystackPayment, verifyPaystackPayment } from "../services/paystack";
import { logger } from "../lib/logger";
import { Payment } from "../models/Payment";
import { Order } from "../models/Order";
const amountSchema = z.object({ amountKes: z.coerce.number().positive().max(1000000) }); const mpesaSchema = amountSchema.extend({ phone: z.string().trim().regex(/^\+2547\d{8}$/, "Use a Kenyan number like +254712345678") }); const referenceSchema = z.object({ reference: z.string().trim().min(1).max(120) });
export const paymentsRouter = Router();

// No auth here on purpose: Paystack calls this server-to-server with no user session, and
// authenticity is instead verified via the HMAC signature on the raw request body.
paymentsRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signatureHeader = req.headers["x-paystack-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!req.rawBody) {
      logger.error("Paystack webhook received without a captured raw body — check app.ts json() verify hook");
      res.status(400).json({ error: "Unable to verify payload" });
      return;
    }
    await handlePaystackWebhookEvent(req.rawBody, signature);
    // Paystack expects a fast 200 acknowledging receipt regardless of business-logic outcome
    // (a missing/unknown reference isn't Paystack's problem) — only a bad signature is rejected.
    res.status(200).json({ received: true });
  }),
);

paymentsRouter.use(requireAuth);
paymentsRouter.post("/paystack/initialize", asyncHandler(async (req, res) => { const user = req.user; if (!user) throw unauthorized("Authentication required"); const body = amountSchema.parse(req.body); res.status(201).json(await initializePaystackPayment(String(user._id), body.amountKes, user.email)); }));
paymentsRouter.post("/mpesa/initialize", asyncHandler(async (req, res) => { const user = req.user; if (!user) throw unauthorized("Authentication required"); const body = mpesaSchema.parse(req.body); res.status(201).json(await initializeMpesaPayment(String(user._id), body.amountKes, user.email, body.phone)); }));
paymentsRouter.post("/paystack/verify", asyncHandler(async (req, res) => { const user = req.user; if (!user) throw unauthorized("Authentication required"); const body = referenceSchema.parse(req.body); const payment = await verifyPaystackPayment(String(user._id), body.reference); res.json({ payment: payment ? { reference: payment.reference, amountKes: payment.amountKes, status: payment.status, creditedAt: payment.creditedAt } : null }); }));
paymentsRouter.get("/history", asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw unauthorized("Authentication required");
  const [payments, orders] = await Promise.all([
    Payment.find({ userId: user._id, status: "success" }).sort({ createdAt: -1 }).limit(100).lean().exec(),
    Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100).lean().exec(),
  ]);
  res.json({
    transactions: [
      ...payments.map(payment => ({ id: `payment:${payment.reference}`, description: "Wallet funding", reference: payment.reference, type: "credit", amountKes: payment.amountKes, currency: payment.currency, status: payment.status, method: payment.method, createdAt: payment.createdAt.toISOString() })),
      ...orders.map(order => ({ id: `order:${String(order._id)}`, description: order.serviceName, reference: String(order._id), type: "debit", amountKes: order.costKes, currency: order.costCurrency, status: order.status, method: "order", createdAt: order.createdAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
  });
}));
