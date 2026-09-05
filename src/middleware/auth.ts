import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../lib/httpError";
import { verifyAuthToken } from "../lib/tokens";
import { User } from "../models/User";

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token !== "") return token;
  }
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const cookieToken = cookies ? cookies.token : undefined;
  if (typeof cookieToken === "string" && cookieToken.trim() !== "") return cookieToken.trim();
  return null;
}

export async function resolveSessionUser(req: Request): Promise<boolean> {
  const token = extractBearerToken(req);
  if (!token) return false;
  const payload = verifyAuthToken(token);
  if (!payload) return false;
  const user = await User.findById(payload.sub).exec();
  if (!user || user.isBanned) return false;
  req.user = user;
  req.viaApiKey = false;
  req.isAdmin = payload.role === "admin";
  return true;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  void resolveSessionUser(req)
    .then((ok) => {
      if (!ok) {
        next(unauthorized("Authentication required"));
        return;
      }
      next();
    })
    .catch(next);
}
