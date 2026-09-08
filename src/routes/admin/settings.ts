import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { invalidateCatalogCache, repriceCatalog, syncCatalog } from "../../services/catalogSync";
import { ServiceCatalog } from "../../models/ServiceCatalog";
import {
  getDisabledServices,
  getDisabledProviderServices,
  getMaintenanceMode,
  getMarginPercent,
  setDisabledServices,
  setDisabledProviderServices,
  setMaintenanceMode,
  setMarginPercent,
  getOrderProcessingHours,
  setOrderProcessingHours,
  getProviderAlertNumbers,
  setProviderAlertNumbers,
  getProviderAlertSenderId,
  setProviderAlertSenderId,
} from "../../services/settings";

const maintenanceSchema = z.object({ enabled: z.coerce.boolean() });
const marginSchema = z.object({ marginPercent: z.coerce.number().min(0).max(1000) });
const disabledSchema = z.object({ canonicalKeys: z.array(z.string().trim().min(1)).max(5000) });

export const adminSettingsRouter = Router();

adminSettingsRouter.get(
  "/maintenance",
  asyncHandler(async (_req, res) => {
    res.json({ maintenanceMode: await getMaintenanceMode() });
  }),
);

adminSettingsRouter.post(
  "/maintenance",
  asyncHandler(async (req, res) => {
    const body = maintenanceSchema.parse(req.body);
    res.json({ maintenanceMode: await setMaintenanceMode(body.enabled) });
  }),
);

adminSettingsRouter.get("/disabled-provider-services", asyncHandler(async (_req, res) => {
  res.json({ providerServices: await getDisabledProviderServices() });
}));

adminSettingsRouter.post("/disabled-provider-services", asyncHandler(async (req, res) => {
  const body = z.object({ providerServices: z.array(z.string().trim().min(1)).max(10000) }).parse(req.body);
  const providerServices = await setDisabledProviderServices(body.providerServices);
  // A provider toggle should acknowledge immediately. The provider sync can take
  // several seconds and must not make the admin control look frozen.
  void syncCatalog({ triggeredBy: "admin" }).catch(() => undefined);
  res.json({ providerServices, syncing: true });
}));

adminSettingsRouter.get("/provider-alerts", asyncHandler(async (_req, res) => {
  res.json({ numbers: await getProviderAlertNumbers(), senderId: await getProviderAlertSenderId(), configured: Boolean(process.env.NENA_API_KEY) });
}));

adminSettingsRouter.post("/provider-alerts", asyncHandler(async (req, res) => {
  const body = z.object({ numbers: z.array(z.string().trim().min(7)).max(20), senderId: z.string().trim().min(1).max(20) }).parse(req.body);
  res.json({ numbers: await setProviderAlertNumbers(body.numbers), senderId: await setProviderAlertSenderId(body.senderId), configured: Boolean(process.env.NENA_API_KEY) });
}));

adminSettingsRouter.get("/processing-window", asyncHandler(async (_req, res) => {
  res.json({ hours: await getOrderProcessingHours() });
}));

adminSettingsRouter.post("/processing-window", asyncHandler(async (req, res) => {
  const body = z.object({ hours: z.coerce.number().min(0).max(168) }).parse(req.body);
  res.json({ hours: await setOrderProcessingHours(body.hours) });
}));

adminSettingsRouter.get(
  "/margin",
  asyncHandler(async (_req, res) => {
    res.json({ marginPercent: await getMarginPercent() });
  }),
);

adminSettingsRouter.post(
  "/margin",
  asyncHandler(async (req, res) => {
    const body = marginSchema.parse(req.body);
    const marginPercent = await setMarginPercent(body.marginPercent);
    const repriced = await repriceCatalog(marginPercent);
    res.json({ marginPercent, repriced });
  }),
);

adminSettingsRouter.get(
  "/disabled-services",
  asyncHandler(async (_req, res) => {
    res.json({ canonicalKeys: await getDisabledServices() });
  }),
);

adminSettingsRouter.post(
  "/disabled-services",
  asyncHandler(async (req, res) => {
    const body = disabledSchema.parse(req.body);
    const keys = await setDisabledServices(body.canonicalKeys);
    await ServiceCatalog.updateMany({ canonicalKey: { $in: keys } }, { $set: { isDisabled: true } }).exec();
    await ServiceCatalog.updateMany({ canonicalKey: { $nin: keys } }, { $set: { isDisabled: false } }).exec();
    invalidateCatalogCache();
    res.json({ canonicalKeys: keys });
  }),
);
