import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
}

export function signAuthToken(payload: AuthTokenPayload, expiresInSeconds = 60 * 60 * 12): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresInSeconds });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") return null;
    const sub = typeof decoded.sub === "string" ? decoded.sub : "";
    const email = typeof decoded.email === "string" ? decoded.email : "";
    const role = decoded.role === "admin" ? "admin" : "user";
    if (!sub || !email) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  const plain = `gz_${crypto.randomBytes(24).toString("hex")}`;
  return { plain, prefix: plain.slice(0, 10), hash: hashApiKey(plain) };
}

export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}
