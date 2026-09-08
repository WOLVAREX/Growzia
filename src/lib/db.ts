import { ensurePgSchema, pool } from "./pgStore";
import { logger } from "./logger";

let connecting: Promise<typeof pool> | null = null;

export async function connectDb(): Promise<typeof pool> {
  if (connecting) return connecting;
  connecting = ensurePgSchema().then(async () => { await pool.query("SELECT 1"); logger.info("PostgreSQL connected"); return pool; }).finally(() => { connecting = null; });
  return connecting;
}

export async function disconnectDb(): Promise<void> {
  await pool.end();
  logger.info("PostgreSQL disconnected");
}
