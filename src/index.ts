import type { Server } from "node:http";

async function bootstrap(): Promise<void> {
  const { env } = await import("./lib/env");
  const { logger } = await import("./lib/logger");
  const { connectDb, disconnectDb } = await import("./lib/db");
  const { createApp } = await import("./app");
  const { startCatalogSyncCron, stopCatalogSyncCron } = await import("./jobs/catalogSyncCron");
  const { startOrderStatusCron, stopOrderStatusCron } = await import("./jobs/orderStatusCron");

  await connectDb();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`Growzia API listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  startCatalogSyncCron();
  startOrderStatusCron();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);
    stopCatalogSyncCron();
    stopOrderStatusCron();
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled promise rejection", reason);
  });
  process.on("uncaughtException", (error: unknown) => {
    logger.error("Uncaught exception", error);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Growzia failed to start.");
  console.error(message);
  process.exit(1);
});
