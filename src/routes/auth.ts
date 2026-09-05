import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { env } from "../lib/env";
import { badRequest, unauthorized } from "../lib/httpError";
import { generateApiKey, signAuthToken } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { User, type UserDoc } from "../models/User";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(32),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

function publicUser(user: UserDoc): Record<string, unknown> {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    balanceKes: user.balanceKes,
    isBanned: user.isBanned,
    isAdmin: user.isAdmin,
    apiKeyPrefix: user.apiKeyPrefix,
    apiKeyActive: user.apiKeyActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export const authRouter = Router();

const loginRateLimit = rateLimit({ windowMs: 60000, max: 10, keyPrefix: "user-login" });

authRouter.post(
  "/register",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await User.findOne({ $or: [{ email: body.email }, { username: body.username }] })
      .select("_id")
      .lean()
      .exec();
    if (existing) throw badRequest("An account with that email or username already exists");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await User.create({
      email: body.email,
      username: body.username,
      passwordHash,
      balanceKes: 0,
      isAdmin: body.email === env.ADMIN_EMAIL.toLowerCase(),
    });

    const token = signAuthToken({
      sub: String(user._id),
      email: user.email,
      role: user.isAdmin ? "admin" : "user",
    });
    res.status(201).json({ token, user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email }).exec();
    if (!user) throw unauthorized("Invalid email or password");
    if (user.isBanned) throw unauthorized("This account is suspended");

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw unauthorized("Invalid email or password");

    if (user.email === env.ADMIN_EMAIL.toLowerCase() && !user.isAdmin) {
      user.isAdmin = true;
      await user.save();
    }

    const token = signAuthToken({
      sub: String(user._id),
      email: user.email,
      role: user.isAdmin ? "admin" : "user",
    });
    res.json({ token, user: publicUser(user) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/api-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");

    const generated = generateApiKey();
    user.apiKeyHash = generated.hash;
    user.apiKeyPrefix = generated.prefix;
    user.apiKeyActive = true;
    user.apiKeyCallCount = 0;
    user.apiKeyLastUsedAt = null;
    await user.save();

    res.status(201).json({ apiKey: generated.plain, apiKeyPrefix: generated.prefix });
  }),
);

authRouter.delete(
  "/api-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw unauthorized("Authentication required");
    user.apiKeyActive = false;
    user.apiKeyHash = null;
    user.apiKeyPrefix = null;
    await user.save();
    res.json({ revoked: true });
  }),
);
