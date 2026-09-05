import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { env } from "../../lib/env";
import { unauthorized } from "../../lib/httpError";
import { signAuthToken } from "../../lib/tokens";
import { adminAuth } from "../../middleware/adminAuth";
import { rateLimit } from "../../middleware/rateLimit";
import { User } from "../../models/User";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).optional(),
  email: z.string().trim().optional(),
  username: z.string().trim().optional(),
  password: z.string().min(1, "Password is required"),
});

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export const adminAuthRouter = Router();

adminAuthRouter.post(
  "/login",
  rateLimit({ windowMs: 60000, max: 8, keyPrefix: "admin-login" }),
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const identifier = String(body.identifier ?? body.email ?? body.username ?? "").trim();
    if (identifier === "") throw unauthorized("Invalid credentials");

    const matchesIdentity =
      timingSafeEquals(identifier.toLowerCase(), env.ADMIN_EMAIL.toLowerCase()) ||
      timingSafeEquals(identifier, env.ADMIN_USERNAME);
    const matchesPassword = timingSafeEquals(body.password, env.ADMIN_PASSWORD);
    if (!matchesIdentity || !matchesPassword) throw unauthorized("Invalid credentials");

    const adminEmail = env.ADMIN_EMAIL.toLowerCase();
    let admin = await User.findOne({ email: adminEmail }).exec();
    if (!admin) {
      admin = await User.create({
        email: adminEmail,
        username: env.ADMIN_USERNAME,
        passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 10),
        balanceKes: 0,
        isAdmin: true,
      });
    } else if (!admin.isAdmin) {
      admin.isAdmin = true;
      await admin.save();
    }

    const token = signAuthToken({ sub: String(admin._id), email: adminEmail, role: "admin" });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({
      token,
      admin: { id: String(admin._id), email: adminEmail, username: admin.username },
    });
  }),
);

adminAuthRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie("token");
    res.json({ loggedOut: true });
  }),
);

adminAuthRouter.get(
  "/session",
  adminAuth,
  asyncHandler(async (req, res) => {
    res.json({
      admin: {
        id: req.user ? String(req.user._id) : null,
        email: env.ADMIN_EMAIL.toLowerCase(),
        username: env.ADMIN_USERNAME,
      },
    });
  }),
);
