import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError";
import { isProduction } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first && first.path.length > 0 ? `${first.path.join(".")}: ` : "";
    res.status(400).json({ error: `${field}${first ? first.message : "Invalid request"}` });
    return;
  }

  const message = errorMessage(error);
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${message}`);
  res.status(500).json({ error: isProduction ? "Internal server error" : message });
}
