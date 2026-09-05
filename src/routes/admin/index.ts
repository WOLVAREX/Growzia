import { Router } from "express";
import { adminAuth } from "../../middleware/adminAuth";
import { adminAuthRouter } from "./auth";
import { adminCatalogRouter } from "./catalog";
import { adminDashboardRouter } from "./dashboard";
import { adminOrdersRouter } from "./orders";
import { adminSettingsRouter } from "./settings";
import { adminUsersRouter } from "./users";
import { adminEmailRouter } from "./email";

export const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use("/", adminAuth, adminDashboardRouter);
adminRouter.use("/orders", adminAuth, adminOrdersRouter);
adminRouter.use("/catalog", adminAuth, adminCatalogRouter);
adminRouter.use("/settings", adminAuth, adminSettingsRouter);
adminRouter.use("/users", adminAuth, adminUsersRouter);
adminRouter.use("/email", adminAuth, adminEmailRouter);
