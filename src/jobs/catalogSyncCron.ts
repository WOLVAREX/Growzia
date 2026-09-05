import { env } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";
import { syncCatalog } from "../services/catalogSync";

let timer: NodeJS.Timeout | null = null;

async function runOnce(triggeredBy: "cron" | "startup"): Promise<void> {
  try {
    const result = await syncCatalog({ triggeredBy });
    logger.info(`Catalogue ready with ${result.count} services (updated ${result.updatedAt})`);
  } catch (error: unknown) {
    logger.warn(`Catalogue sync skipped: ${errorMessage(error)}`);
  }
}

export function startCatalogSyncCron(): void {
  if (timer) return;
  const intervalMs = Math.max(1, env.CATALOGUE_SYNC_INTERVAL_MINUTES) * 60 * 1000;

  void runOnce("startup");
  timer = setInterval(() => {
    void runOnce("cron");
  }, intervalMs);
  timer.unref();
  logger.info(`Catalogue sync scheduled every ${env.CATALOGUE_SYNC_INTERVAL_MINUTES} minute(s)`);
}

export function stopCatalogSyncCron(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
