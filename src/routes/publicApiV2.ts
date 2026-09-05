import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { env } from "../lib/env";
import { HttpError } from "../lib/httpError";
import { errorMessage, logger } from "../lib/logger";
import { requireApiKey } from "../middleware/apiKeyAuth";
import { rateLimit } from "../middleware/rateLimit";
import { Order } from "../models/Order";
import { getCachedCatalog } from "../services/catalogSync";
import { placeOrder, refreshOrderStatus } from "../services/orders";
import { convertFromKes, resolveCurrency } from "../services/pricing";

const addSchema = z.object({
  service: z.string().trim().min(1),
  link: z.string().trim().url(),
  quantity: z.coerce.number().int().positive(),
});

const statusSchema = z.object({ order: z.string().trim().min(1) });

export const publicApiV2Router = Router();

publicApiV2Router.post(
  "/",
  rateLimit({ windowMs: 60000, max: 60, keyPrefix: "api-v2" }),
  requireApiKey,
  (req: Request, res: Response): void => {
    void handleV2(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof z.ZodError) {
        const first = error.issues[0];
        res.status(400).json({ error: first ? first.message : "Invalid request" });
        return;
      }
      logger.error(`Public API v2 error: ${errorMessage(error)}`);
      res.status(500).json({ error: "Request failed" });
    });
  },
);

async function handleV2(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "").trim().toLowerCase();
  const currency = resolveCurrency(env.DEFAULT_CURRENCY);

  if (action === "services") {
    const entries = await getCachedCatalog();
    res.json(
      entries.map((entry) => ({
        service: entry.id,
        name: entry.name,
        type: "Default",
        category: entry.category,
        rate: convertFromKes(entry.sellKesPer1000, currency.code).toFixed(2),
        min: String(entry.min),
        max: String(entry.max),
        dripfeed: false,
        refill: false,
        cancel: false,
      })),
    );
    return;
  }

  if (action === "add") {
    const parsed = addSchema.parse(body);
    const order = await placeOrder(
      String(user._id),
      parsed.service,
      parsed.link,
      parsed.quantity,
      currency.code,
    );
    res.json({ order: String(order._id) });
    return;
  }

  if (action === "status") {
    const parsed = statusSchema.parse(body);
    if (!Types.ObjectId.isValid(parsed.order)) {
      res.json({ error: "Incorrect order ID" });
      return;
    }
    const owned = await Order.findOne({ _id: parsed.order, userId: user._id }).select("_id").lean().exec();
    if (!owned) {
      res.json({ error: "Incorrect order ID" });
      return;
    }
    const order = await refreshOrderStatus(parsed.order);
    res.json({
      charge: order.costInSelectedCurrency.toFixed(2),
      start_count: String(order.startCount ?? 0),
      status: order.status,
      remains: String(order.remains ?? 0),
      currency: order.costCurrency,
    });
    return;
  }

  if (action === "balance") {
    res.json({
      balance: convertFromKes(user.balanceKes, currency.code).toFixed(2),
      currency: currency.code,
    });
    return;
  }

  res.status(400).json({ error: "Invalid action" });
}
