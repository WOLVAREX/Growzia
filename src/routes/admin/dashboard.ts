import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { Order, type OrderStatus } from "../../models/Order";
import { ServiceCatalog } from "../../models/ServiceCatalog";
import { User } from "../../models/User";
import { getCatalogMeta } from "../../services/catalogSync";
import { getMaintenanceMode, getMarginPercent, getOrderProcessingHours, getProviderAlertNumbers } from "../../services/settings";

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totalUsers, bannedUsers, totalOrders, ordersToday, revenue, revenueToday, grouped, catalogCount, maintenanceMode, marginPercent, queuedOrders, alertNumbers, orderProcessingHours] =
      await Promise.all([
        User.countDocuments({}).exec(),
        User.countDocuments({ isBanned: true }).exec(),
        Order.countDocuments({}).exec(),
        Order.countDocuments({ createdAt: { $gte: startOfDay } }).exec(),
        Order.aggregate<{ _id: null; total: number }>([
          { $match: { status: { $nin: ["failed", "refunded"] } } },
          { $group: { _id: null, total: { $sum: "$costKes" } } },
        ]).exec(),
        Order.aggregate<{ _id: null; total: number }>([
          { $match: { status: { $nin: ["failed", "refunded"] }, createdAt: { $gte: startOfDay } } },
          { $group: { _id: null, total: { $sum: "$costKes" } } },
        ]).exec(),
        Order.aggregate<{ _id: OrderStatus; count: number }>([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]).exec(),
        ServiceCatalog.countDocuments({}).exec(),
        getMaintenanceMode(),
        getMarginPercent(),
        Order.countDocuments({ status: "pending", providerOrderId: null }).exec(),
        getProviderAlertNumbers(),
        getOrderProcessingHours(),
      ]);

    const ordersByStatus: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      partial: 0,
      failed: 0,
      refunded: 0,
    };
    for (const row of grouped) ordersByStatus[row._id] = row.count;

    res.json({
      totalUsers,
      bannedUsers,
      totalOrders,
      ordersToday,
      totalRevenueKes: revenue[0] ? Number(revenue[0].total.toFixed(2)) : 0,
      revenueTodayKes: revenueToday[0] ? Number(revenueToday[0].total.toFixed(2)) : 0,
      ordersByStatus,
      catalogCount,
      catalogMeta: getCatalogMeta(),
      maintenanceMode,
      marginPercent,
      queuedOrders,
      providerAlertNumbers: alertNumbers.length,
      orderProcessingHours,
    });
  }),
);
