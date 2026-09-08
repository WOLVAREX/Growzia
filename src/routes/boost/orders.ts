import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { env } from "../../lib/env";
import { badRequest, forbidden, unauthorized } from "../../lib/httpError";
import { rateLimit } from "../../middleware/rateLimit";
import { sessionOrApiKey } from "../../middleware/sessionOrApiKey";
import { getUserOrders, placeOrder, refreshOrderStatus, toPublicOrder } from "../../services/orders";
import { Order } from "../../models/Order";
import { User } from "../../models/User";
import { isSupportedCurrency } from "../../services/pricing";

const orderSchema = z.object({
  serviceId: z.string().trim().min(1, "serviceId is required"),
  link: z.string().trim().url("link must be a valid URL"),
  quantity: z.coerce.number().int().positive("quantity must be a positive integer"),
  currency: z
    .string()
    .trim()
    .max(8)
    .optional()
    .transform((value) => (value === undefined || value === "" ? env.DEFAULT_CURRENCY : value.toUpperCase()))
    .refine((value) => isSupportedCurrency(value), { message: "currency is not supported" }),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export const ordersRouter = Router();

const orderRateLimit = rateLimit({ windowMs: 60000, max: 20, keyPrefix: "boost-order" });

ordersRouter.post(
  "/order",
  sessionOrApiKey,
  orderRateLimit,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");
    const body = orderSchema.parse(req.body);

    const order = await placeOrder(String(user._id), body.serviceId, body.link, body.quantity, body.currency);
    const refreshedUser = await User.findById(user._id).select("balanceKes").lean().exec();
    res.status(201).json({ order: toPublicOrder(order), balanceKes: refreshedUser?.balanceKes ?? null });
  }),
);

ordersRouter.get(
  "/orders",
  sessionOrApiKey,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");
    const query = listSchema.parse(req.query);
    const result = await getUserOrders(String(user._id), query.limit ?? 50, query.skip ?? 0);
    res.json(result);
  }),
);

ordersRouter.get(
  "/orders/:id/refresh",
  sessionOrApiKey,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid order id");

    const owned = await Order.findOne({ _id: id, userId: user._id }).select("_id").lean().exec();
    if (!owned) throw forbidden("You do not have access to this order");

    const order = await refreshOrderStatus(id);
    res.json({ order: toPublicOrder(order) });
  }),
);
