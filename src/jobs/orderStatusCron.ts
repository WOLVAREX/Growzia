import { env } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";
import { processPendingOrders, refreshNonTerminalOrders } from "../services/orders";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const refreshed = await refreshNonTerminalOrders(50);
    const submitted = await processPendingOrders(25);
    if (submitted > 0) logger.info(`Submitted ${submitted} queued order(s)`);
    if (refreshed > 0) logger.info(`Refreshed ${refreshed} open order(s)`);
  } catch (error: unknown) {
    logger.warn(`Order status refresh skipped: ${errorMessage(error)}`);
  } finally {
    running = false;
  }
}

export function startOrderStatusCron(): void {
  if (timer) return;
  const intervalMs = Math.max(1, env.ORDER_STATUS_SYNC_INTERVAL_MINUTES) * 60 * 1000;

  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  timer.unref();
  logger.info(`Order status refresh scheduled every ${env.ORDER_STATUS_SYNC_INTERVAL_MINUTES} minute(s)`);
}

export function stopOrderStatusCron(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
