import { Router } from "express";
import { Types, type FilterQuery } from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest, notFound } from "../../lib/httpError";
import { Order, ORDER_STATUSES, type OrderDoc } from "../../models/Order";
import { initiatePendingOrder, inspectPendingOrder, refreshOrderStatus } from "../../services/orders";

const listSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "partial", "failed", "refunded"]).optional(),
  user: z.string().trim().max(64).optional(),
  service: z.string().trim().max(120).optional(),
  providerOrderId: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminOrdersRouter = Router();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

adminOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listSchema.parse(req.query);
    const filter: FilterQuery<OrderDoc> = {};

    if (query.status) filter.status = query.status;
    if (query.user && Types.ObjectId.isValid(query.user)) filter.userId = new Types.ObjectId(query.user);
    if (query.service) filter.serviceName = { $regex: escapeRegex(query.service), $options: "i" };
    if (query.providerOrderId) filter.providerOrderId = query.providerOrderId;

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Order.find(filter)
        .select("+providerCode +providerServiceId +providerOrderId +providerAlertSentAt +failureReason")
        .populate<{ userId: { _id: Types.ObjectId; email: string; username: string } }>("userId", "email username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      Order.countDocuments(filter).exec(),
    ]);

    res.json({
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
      statuses: ORDER_STATUSES,
      orders: docs.map((doc) => {
        const populated = doc.userId as unknown as { _id: Types.ObjectId; email?: string; username?: string } | null;
        return {
          id: String(doc._id),
          user: populated
            ? { id: String(populated._id), email: populated.email ?? "", username: populated.username ?? "" }
            : null,
          serviceName: doc.serviceName,
          platformId: doc.platformId,
          serviceType: doc.serviceType,
          link: doc.link,
          quantity: doc.quantity,
          costKes: doc.costKes,
          costCurrency: doc.costCurrency,
          costInSelectedCurrency: doc.costInSelectedCurrency,
          providerCode: doc.providerCode,
          providerServiceId: doc.providerServiceId,
          providerOrderId: doc.providerOrderId,
          providerAlertSentAt: doc.providerAlertSentAt,
          failureReason: doc.failureReason,
          status: doc.status,
          remains: doc.remains,
          startCount: doc.startCount,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      }),
    });
  }),
);

adminOrdersRouter.post(
  "/:id/initiate",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid order id");
    const order = await initiatePendingOrder(id);
    res.json({ order: { id: String(order._id), status: order.status, providerCode: order.providerCode, providerOrderId: order.providerOrderId } });
  }),
);

adminOrdersRouter.get(
  "/:id/provider-check",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid order id");
    res.json({ inspection: await inspectPendingOrder(id) });
  }),
);

adminOrdersRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid order id");

    const order = await Order.findByIdAndUpdate(
      id,
      { $set: { status: "completed", remains: 0, failureReason: null } },
      { new: true },
    ).exec();
    if (!order) throw notFound("Order not found");

    res.json({ order: { id: String(order._id), status: order.status } });
  }),
);

adminOrdersRouter.post(
  "/:id/refresh",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid order id");

    const order = await refreshOrderStatus(id);
    res.json({ order: { id: String(order._id), status: order.status, remains: order.remains } });
  }),
);
