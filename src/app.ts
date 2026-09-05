import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./lib/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const origins = env.FRONTEND_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

  app.use(
    cors({
      origin: origins.length > 0 ? origins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    res.json({ name: "Growzia API", status: "ok" });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
