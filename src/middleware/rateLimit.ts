import type { NextFunction, Request, Response } from "express";
import { tooManyRequests } from "../lib/httpError";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientKey(req: Request, prefix: string): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp =
    typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : Array.isArray(forwarded) ? forwarded[0] : undefined;
  const ip = forwardedIp && forwardedIp !== "" ? forwardedIp : req.ip ?? req.socket.remoteAddress ?? "unknown";
  const userId = req.user ? String(req.user._id) : "anonymous";
  return `${prefix}:${ip}:${userId}`;
}

export function rateLimit(options: RateLimitOptions) {
  const windowMs = Math.max(1000, options.windowMs);
  const max = Math.max(1, options.max);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    sweep(now);

    const key = clientKey(req, options.keyPrefix);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      next(tooManyRequests("Too many requests. Please slow down."));
      return;
    }

    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    next();
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
