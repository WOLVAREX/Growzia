import type { OrderStatus } from "../models/Order";

const COMPLETED = ["completed", "complete", "success", "successful", "done", "finished"];
const PARTIAL = ["partial", "partiallycompleted", "partialcomplete"];
const PROCESSING = ["processing", "inprogress", "progress", "running", "active", "started"];
const PENDING = ["pending", "queued", "waiting", "new", "awaiting"];
const FAILED = ["failed", "fail", "error", "canceled", "cancelled", "rejected", "expired"];
const REFUNDED = ["refunded", "refund", "reversed"];

export function normalizeBoostStatus(
  raw: string | undefined | null,
  fallback: OrderStatus = "pending",
): OrderStatus {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (value === "") return fallback;
  if (COMPLETED.includes(value)) return "completed";
  if (PARTIAL.includes(value)) return "partial";
  if (PROCESSING.includes(value)) return "processing";
  if (PENDING.includes(value)) return "pending";
  if (FAILED.includes(value)) return "failed";
  if (REFUNDED.includes(value)) return "refunded";
  return fallback;
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "completed" || status === "failed" || status === "refunded" || status === "partial";
}
