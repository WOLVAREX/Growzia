import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { Order } from "../../models/Order";
import { Payment } from "../../models/Payment";
import { User } from "../../models/User";

const querySchema = z.object({ status: z.enum(["pending", "success", "failed"]).optional(), type: z.enum(["payment", "order"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });
export const adminTransactionsRouter = Router();

adminTransactionsRouter.get("/", asyncHandler(async (req, res) => {
  const query = querySchema.parse(req.query);
  const [payments, orders] = await Promise.all([
    query.type === "order" ? Promise.resolve([]) : Payment.find(query.status ? { status: query.status } : {}).sort({ createdAt: -1 }).limit(query.limit).lean().exec(),
    query.type === "payment" ? Promise.resolve([]) : Order.find({}).sort({ createdAt: -1 }).limit(query.limit).lean().exec(),
  ]);
  const userIds = Array.from(new Set([...payments, ...orders].map(item => String(item.userId))));
  const users = await User.find({ _id: { $in: userIds } }).select("username email").lean().exec();
  const usersById = new Map(users.map(user => [String(user._id), user]));
  const transactions = [
    ...payments.map(payment => ({ id: `payment:${payment.reference}`, type: "payment", user: usersById.get(String(payment.userId)) ? { username: usersById.get(String(payment.userId))!.username, email: usersById.get(String(payment.userId))!.email } : null, description: "Wallet funding", reference: payment.reference, status: payment.status, method: payment.method, amountKes: payment.amountKes, currency: payment.currency, createdAt: payment.createdAt })),
    ...orders.map(order => ({ id: `order:${String(order._id)}`, type: "order", user: usersById.get(String(order.userId)) ? { username: usersById.get(String(order.userId))!.username, email: usersById.get(String(order.userId))!.email } : null, description: order.serviceName, reference: String(order._id), status: order.status, method: "order", amountKes: order.costKes, currency: order.costCurrency, createdAt: order.createdAt })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, query.limit);
  res.json({ transactions });
}));
