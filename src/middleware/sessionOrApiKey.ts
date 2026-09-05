import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../lib/httpError";
import { resolveSessionUser } from "./auth";
import { resolveApiKeyUser } from "./apiKeyAuth";

export function sessionOrApiKey(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    if (await resolveSessionUser(req)) return true;
    return resolveApiKeyUser(req);
  })()
    .then((ok) => {
      if (!ok) {
        next(unauthorized("Authentication required"));
        return;
      }
      next();
    })
    .catch(next);
}
