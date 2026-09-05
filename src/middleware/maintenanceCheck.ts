import type { NextFunction, Request, Response } from "express";
import { serviceUnavailable } from "../lib/httpError";
import { getMaintenanceMode } from "../services/settings";

export function maintenanceCheck(_req: Request, _res: Response, next: NextFunction): void {
  void getMaintenanceMode()
    .then((enabled) => {
      if (enabled) {
        next(serviceUnavailable("Growzia is under maintenance. Please try again shortly."));
        return;
      }
      next();
    })
    .catch(next);
}
