import type { NextFunction, Request, Response } from "express";
import { env } from "../lib/env";
import { forbidden, unauthorized } from "../lib/httpError";
import { verifyAuthToken } from "../lib/tokens";
import { User } from "../models/User";
import { extractBearerToken } from "./auth";

export function adminAuth(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    const token = extractBearerToken(req);
    if (!token) throw unauthorized("Authentication required");

    const payload = verifyAuthToken(token);
    if (!payload) throw unauthorized("Invalid or expired session");

    const adminEmail = env.ADMIN_EMAIL.toLowerCase();
    if (payload.email.toLowerCase() !== adminEmail || payload.role !== "admin") {
      throw forbidden("Administrator access required");
    }

    const user = await User.findOne({ email: adminEmail }).exec();
    if (user) {
      if (user.isBanned) throw forbidden("Administrator access required");
      req.user = user;
    }
    req.isAdmin = true;
    req.viaApiKey = false;
  })()
    .then(() => next())
    .catch(next);
}
