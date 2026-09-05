import { Router } from "express";
import mongoose from "mongoose";
import { maintenanceCheck } from "../middleware/maintenanceCheck";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { catalogRouter } from "./boost/catalog";
import { ordersRouter } from "./boost/orders";
import { publicApiV2Router } from "./publicApiV2";
import { paymentsRouter } from "./payments";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/boost", maintenanceCheck, catalogRouter);
apiRouter.use("/boost", maintenanceCheck, ordersRouter);
apiRouter.use("/v2", maintenanceCheck, publicApiV2Router);
apiRouter.use("/admin", adminRouter);
