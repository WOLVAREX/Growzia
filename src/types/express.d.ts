import type { UserDoc } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
      viaApiKey?: boolean;
      isAdmin?: boolean;
      rawBody?: Buffer;
    }
  }
}

export {};
