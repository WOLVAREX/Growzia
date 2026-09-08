import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { Order, type OrderStatus } from "../../models/Order";
import { ServiceCatalog } from "../../models/ServiceCatalog";
import { User } from "../../models/User";
import { getCatalogMeta } from "../../services/catalogSync";
import { getMaintenanceMode, getMarginPercent, getOrderProcessingHours, getProviderAlertNumbers } from "../../services/settings";
import { bwmClient } from "../../services/providers/bwm";
import { cheapGainsClient } from "../../services/providers/cheapgains";

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  "/finance",
  asyncHandler(async (req, res) => {
    const period = req.query.period === "week" || req.query.period === "month" ? String(req.query.period) : "all";
    const since = period === "week" ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : period === "month" ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null;
    const [catalogRows, orderRows] = await Promise.all([
      ServiceCatalog.find({}).select("+baseKesPer1000").lean().exec(),
      Order.find(since ? { createdAt: { $gte: since } } : {}).select("serviceCatalogId serviceName platformId serviceType quantity costKes status providerCode providerServiceId link createdAt").lean().exec(),
    ]);
    const baseByCatalogId = new Map(catalogRows.map((service) => [String(service._id), Number(service.baseKesPer1000) || 0]));
    const rows = orderRows.map((order) => {
      const providerCostKes = order.status === "failed" || order.status === "refunded" ? 0 : (baseByCatalogId.get(String(order.serviceCatalogId)) ?? 0) * (Number(order.quantity) || 0) / 1000;
      const customerPriceKes = order.status === "failed" || order.status === "refunded" ? 0 : Number(order.costKes) || 0;
      return { id: String(order._id), createdAt: order.createdAt, serviceName: order.serviceName, platformId: order.platformId, serviceType: order.serviceType, quantity: order.quantity, link: order.link, providerCode: order.providerCode, providerServiceId: order.providerServiceId, status: order.status, customerPriceKes: Number(customerPriceKes.toFixed(2)), providerCostKes: Number(providerCostKes.toFixed(2)), growziaBenefitKes: Number((customerPriceKes - providerCostKes).toFixed(2)) };
    });
    const summary = rows.reduce((acc, row) => { acc.customerRevenueKes += row.customerPriceKes; acc.providerCostKes += row.providerCostKes; acc.growziaBenefitKes += row.growziaBenefitKes; return acc; }, { customerRevenueKes: 0, providerCostKes: 0, growziaBenefitKes: 0 });
    const platforms = Object.values(rows.reduce<Record<string, { platformId: string; customerRevenueKes: number; providerCostKes: number; growziaBenefitKes: number; orders: number }>>((acc, row) => { const key = row.platformId || "other"; const item = acc[key] ??= { platformId: key, customerRevenueKes: 0, providerCostKes: 0, growziaBenefitKes: 0, orders: 0 }; item.customerRevenueKes += row.customerPriceKes; item.providerCostKes += row.providerCostKes; item.growziaBenefitKes += row.growziaBenefitKes; item.orders += 1; return acc; }, {})).map((item) => ({ ...item, customerRevenueKes: Number(item.customerRevenueKes.toFixed(2)), providerCostKes: Number(item.providerCostKes.toFixed(2)), growziaBenefitKes: Number(item.growziaBenefitKes.toFixed(2)) }));
    res.json({ period, since, summary: { ...summary, customerRevenueKes: Number(summary.customerRevenueKes.toFixed(2)), providerCostKes: Number(summary.providerCostKes.toFixed(2)), growziaBenefitKes: Number(summary.growziaBenefitKes.toFixed(2)) }, platforms, orders: rows });
  }),
);

adminDashboardRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totalUsers, bannedUsers, totalOrders, ordersToday, revenue, revenueToday, grouped, catalogCount, maintenanceMode, marginPercent, queuedOrders, alertNumbers, orderProcessingHours, bwmBalance, cheapgainsBalance, catalogRows, orderRows] =
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
        bwmClient.getBalanceKes ? bwmClient.getBalanceKes().catch(() => null) : Promise.resolve(null),
        cheapGainsClient.getBalanceKes ? cheapGainsClient.getBalanceKes().catch(() => null) : Promise.resolve(null),
        ServiceCatalog.find({}).select("+baseKesPer1000").lean().exec(),
        Order.find({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }).select("serviceCatalogId quantity costKes status").lean().exec(),
      ]);

    const baseByCatalogId = new Map(catalogRows.map((service) => [String(service._id), Number(service.baseKesPer1000) || 0]));
    let customerRevenueKes = 0;
    let providerCostKes = 0;
    for (const order of orderRows) {
      if (order.status === "failed" || order.status === "refunded") continue;
      customerRevenueKes += Number(order.costKes) || 0;
      providerCostKes += (baseByCatalogId.get(String(order.serviceCatalogId)) ?? 0) * (Number(order.quantity) || 0) / 1000;
    }

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
      financialSummary: {
        customerRevenueKes: Number(customerRevenueKes.toFixed(2)),
        providerCostKes: Number(providerCostKes.toFixed(2)),
        growziaBenefitKes: Number((customerRevenueKes - providerCostKes).toFixed(2)),
      },
      providerBalances: {
        bwm: bwmBalance ? { amount: bwmBalance.balanceKes, currency: bwmBalance.currency, available: true } : { amount: null, currency: null, available: false },
        cheapgains: cheapgainsBalance ? { amount: cheapgainsBalance.balanceKes, currency: cheapgainsBalance.currency, available: true } : { amount: null, currency: null, available: false },
      },
    });
  }),
);
