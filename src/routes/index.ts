import { Router } from "express";
import { pool } from "../lib/pgStore";
import { maintenanceCheck } from "../middleware/maintenanceCheck";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { catalogRouter } from "./boost/catalog";
import { ordersRouter } from "./boost/orders";
import { publicApiV2Router } from "./publicApiV2";
import { paymentsRouter } from "./payments";
import { User } from "../models/User";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", database: "disconnected", time: new Date().toISOString() });
  }
});

apiRouter.get("/public/stats", async (_req, res, next) => {
  try {
    res.json({ users: await User.countDocuments({ isBanned: false }).exec() });
  } catch (error) {
    next(error);
  }
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/boost", maintenanceCheck, catalogRouter);
apiRouter.use("/boost", maintenanceCheck, ordersRouter);
apiRouter.use("/v2", maintenanceCheck, publicApiV2Router);
apiRouter.use("/admin", adminRouter);
