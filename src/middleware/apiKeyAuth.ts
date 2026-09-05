import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../lib/httpError";
import { hashApiKey } from "../lib/tokens";
import { User } from "../models/User";

export function extractApiKey(req: Request): string | null {
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.trim() !== "") return header.trim();
  if (Array.isArray(header) && header.length > 0) {
    const first = header[0];
    if (typeof first === "string" && first.trim() !== "") return first.trim();
  }
  const body = req.body as { key?: unknown } | undefined;
  if (body && typeof body.key === "string" && body.key.trim() !== "") return body.key.trim();
  return null;
}

export async function resolveApiKeyUser(req: Request): Promise<boolean> {
  const key = extractApiKey(req);
  if (!key) return false;
  const user = await User.findOne({ apiKeyHash: hashApiKey(key), apiKeyActive: true }).exec();
  if (!user || user.isBanned) return false;

  req.user = user;
  req.viaApiKey = true;
  req.isAdmin = false;
  await User.updateOne(
    { _id: user._id },
    { $set: { apiKeyLastUsedAt: new Date() }, $inc: { apiKeyCallCount: 1 } },
  ).exec();
  return true;
}

export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  void resolveApiKeyUser(req)
    .then((ok) => {
      if (!ok) {
        next(unauthorized("Invalid API key"));
        return;
      }
      next();
    })
    .catch(next);
}
