import { Types } from "mongoose";
import { env } from "../lib/env";
import { badRequest, notFound, serviceUnavailable } from "../lib/httpError";
import { errorMessage, logger } from "../lib/logger";
import { Order, type OrderDoc, type OrderStatus } from "../models/Order";
import { ServiceCatalog } from "../models/ServiceCatalog";
import { User } from "../models/User";
import { convertFromKes, quantityCostKes, resolveCurrency } from "./pricing";
import { bwmClient } from "./providers/bwm";
import { cheapGainsClient } from "./providers/cheapgains";
import type { ProviderClient, ProviderCode } from "./providers/types";
import { isTerminalStatus, normalizeBoostStatus } from "./statusNormalizer";
import { getOrderProcessingHours } from "./settings";
import { sendProviderAlertInBackground } from "./sms";

const clients: Record<ProviderCode, ProviderClient> = {
  bwm: bwmClient,
  cheapgains: cheapGainsClient,
};

function clientFor(code: ProviderCode): ProviderClient {
  const client = clients[code];
  if (!client) throw serviceUnavailable("This service is temporarily unavailable");
  return client;
}

function toObjectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw badRequest(`Invalid ${label}`);
  return new Types.ObjectId(value);
}

export interface PublicOrder {
  id: string;
  serviceName: string;
  platformId: string;
  serviceType: string;
  link: string;
  quantity: number;
  costKes: number;
  costCurrency: string;
  costInSelectedCurrency: number;
  status: OrderStatus;
  startCount: number | null;
  remains: number | null;
  createdAt: string;
  updatedAt: string;
  processingAfter: string | null;
  processingMessage: string | null;
}

export function toPublicOrder(order: OrderDoc): PublicOrder {
  return {
    id: String(order._id),
    serviceName: order.serviceName,
    platformId: order.platformId,
    serviceType: order.serviceType,
    link: order.link,
    quantity: order.quantity,
    costKes: order.costKes,
    costCurrency: order.costCurrency,
    costInSelectedCurrency: order.costInSelectedCurrency,
    status: order.status,
    startCount: order.startCount,
    remains: order.remains,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    processingAfter: order.processingAfter?.toISOString() ?? null,
    processingMessage: order.processingAfter && !order.providerOrderId
      ? "Your order is queued and will be processed within the configured provider window."
      : null,
  };
}

function isLowBalanceError(error: unknown): boolean {
  const text = errorMessage(error).toLowerCase();
  return ["insufficient", "low balance", "not enough", "fund", "credit", "balance"].some((term) => text.includes(term));
}

async function submitPendingOrder(order: OrderDoc): Promise<OrderDoc> {
  const client = clientFor(order.providerCode);
  order.providerAttemptedAt = new Date();
  await order.save();
  if (client.getBalanceKes) {
    const balance = await client.getBalanceKes();
    if (balance.balanceKes < env.PROVIDER_LOW_BALANCE_THRESHOLD_KES) {
      if (!order.providerAlertSentAt) {
        order.providerAlertSentAt = new Date();
        await order.save();
        sendProviderAlertInBackground(`Growzia provider top-up needed: ${order.providerCode} balance is KES ${balance.balanceKes.toFixed(2)}. Order ${String(order._id)} is queued.`);
      }
      return order;
    }
  }
  const result = await client.placeOrder(order.providerServiceId, order.link, order.quantity);
  order.providerOrderId = result.providerOrderId;
  order.status = normalizeBoostStatus(result.status, "pending");
  order.processingAfter = null;
  await order.save();
  return order;
}

export async function placeOrder(
  userId: string,
  serviceCatalogId: string,
  link: string,
  quantity: number,
  currency: string,
): Promise<OrderDoc> {
  const userObjectId = toObjectId(userId, "user");
  const serviceObjectId = toObjectId(serviceCatalogId, "service id");
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw badRequest("Quantity must be a positive number");

  const service = await ServiceCatalog.findById(serviceObjectId)
    .select("+providerCode +providerServiceId +baseKesPer1000")
    .exec();
  if (!service || service.isDisabled) throw notFound("Service not found");
  if (qty < service.min || qty > service.max) {
    throw badRequest(`Quantity must be between ${service.min} and ${service.max}`);
  }

  const selectedCurrency = resolveCurrency(currency);
  const costKes = quantityCostKes(service.sellKesPer1000, qty);
  if (costKes <= 0) throw badRequest("Computed order cost is invalid");

  const debited = await User.findOneAndUpdate(
    { _id: userObjectId, isBanned: false, balanceKes: { $gte: costKes } },
    { $inc: { balanceKes: -costKes } },
    { new: true },
  ).exec();

  if (!debited) {
    const exists = await User.findById(userObjectId).select("isBanned balanceKes").lean().exec();
    if (!exists) throw notFound("User not found");
    if (exists.isBanned) throw badRequest("This account is suspended");
    throw badRequest("Insufficient balance");
  }

  const order = await Order.create({
    userId: userObjectId,
    serviceCatalogId: service._id,
    serviceName: service.name,
    platformId: service.platformId,
    serviceType: service.serviceType,
    link,
    quantity: qty,
    costKes,
    costCurrency: selectedCurrency.code,
    costInSelectedCurrency: convertFromKes(costKes, selectedCurrency.code),
    providerCode: service.providerCode,
    providerServiceId: service.providerServiceId,
    status: "pending",
  });

  try {
    const hours = await getOrderProcessingHours();
    order.processingAfter = new Date(Date.now() + hours * 60 * 60 * 1000);
    await order.save();
    return await submitPendingOrder(order);
  } catch (error: unknown) {
    const reason = errorMessage(error);
    if (isLowBalanceError(error)) {
      order.processingAfter = new Date(Date.now() + (await getOrderProcessingHours()) * 60 * 60 * 1000);
      if (!order.providerAlertSentAt) {
        order.providerAlertSentAt = new Date();
        sendProviderAlertInBackground(`Growzia provider top-up needed: ${order.providerCode} could not accept order ${String(order._id)} due to low balance.`);
      }
      await order.save();
      return order;
    }
    await User.updateOne({ _id: userObjectId }, { $inc: { balanceKes: costKes } }).exec();
    order.status = "failed";
    order.failureReason = "Order could not be processed";
    await order.save();
    logger.error(`Order ${String(order._id)} failed and was refunded: ${reason}`);
    throw serviceUnavailable("This order could not be processed. Your balance has been refunded.");
  }
}

export async function processPendingOrders(limit = 25): Promise<number> {
  const orders = await Order.find({ status: "pending", providerOrderId: null, processingAfter: { $lte: new Date() } })
    .select("+providerCode +providerServiceId +providerOrderId")
    .sort({ createdAt: 1 }).limit(Math.max(1, limit)).exec();
  let processed = 0;
  for (const order of orders) {
    try {
      await submitPendingOrder(order);
      if (order.providerOrderId) processed += 1;
    } catch (error: unknown) {
      if (isLowBalanceError(error)) {
        if (!order.providerAlertSentAt) {
          order.providerAlertSentAt = new Date();
          sendProviderAlertInBackground(`Growzia provider top-up needed: ${order.providerCode} could not accept queued order ${String(order._id)}.`);
        }
        await order.save();
      } else {
        await User.updateOne({ _id: order.userId }, { $inc: { balanceKes: order.costKes } }).exec();
        order.status = "failed";
        order.failureReason = "Order could not be processed";
        await order.save();
      }
    }
  }
  return processed;
}

export async function refreshOrderStatus(orderId: string): Promise<OrderDoc> {
  const order = await Order.findById(toObjectId(orderId, "order id"))
    .select("+providerCode +providerServiceId +providerOrderId")
    .exec();
  if (!order) throw notFound("Order not found");
  if (!order.providerOrderId) return order;
  if (isTerminalStatus(order.status)) return order;

  try {
    const client = clientFor(order.providerCode);
    const result = await client.getOrderStatus(order.providerOrderId);
    order.status = normalizeBoostStatus(result.status, order.status);
    if (result.remains !== undefined) order.remains = result.remains;
    if (result.startCount !== undefined) order.startCount = result.startCount;
    order.lastStatusCheckAt = new Date();
    await order.save();
    return order;
  } catch (error: unknown) {
    order.lastStatusCheckAt = new Date();
    await order.save();
    logger.warn(`Status refresh failed for order ${String(order._id)}: ${errorMessage(error)}`);
    return order;
  }
}

export async function refreshNonTerminalOrders(limit = 50): Promise<number> {
  const orders = await Order.find({ status: { $in: ["pending", "processing"] } })
    .select("_id")
    .sort({ lastStatusCheckAt: 1, createdAt: 1 })
    .limit(Math.max(1, limit))
    .lean()
    .exec();

  let refreshed = 0;
  for (const order of orders) {
    try {
      await refreshOrderStatus(String(order._id));
      refreshed += 1;
    } catch (error: unknown) {
      logger.warn(`Skipping order ${String(order._id)}: ${errorMessage(error)}`);
    }
  }
  return refreshed;
}

export async function getUserOrders(
  userId: string,
  limit = 50,
  skip = 0,
): Promise<{ orders: PublicOrder[]; stats: Record<string, number>; total: number }> {
  const userObjectId = toObjectId(userId, "user");
  const [docs, total, grouped] = await Promise.all([
    Order.find({ userId: userObjectId }).sort({ createdAt: -1 }).skip(Math.max(0, skip)).limit(Math.max(1, limit)).exec(),
    Order.countDocuments({ userId: userObjectId }).exec(),
    Order.aggregate<{ _id: OrderStatus; count: number }>([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const stats: Record<string, number> = { total };
  for (const row of grouped) stats[row._id] = row.count;

  return { orders: docs.map(toPublicOrder), stats, total };
}
