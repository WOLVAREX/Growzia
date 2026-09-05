import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { env } from "../lib/env";
import { badRequest, unauthorized } from "../lib/httpError";
import { generateApiKey, signAuthToken } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { User, type UserDoc } from "../models/User";
import { emailLayout, sendEmailInBackground } from "../services/email";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(32),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const googleCallback = () => env.GOOGLE_CALLBACK_URL || `${env.FRONTEND_ORIGIN.split(",")[0].replace(/\/$/, "")}/api/auth/google/callback`;

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

authRouter.get("/google", (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return;
  }
  const state = randomBytes(24).toString("hex");
  res.cookie("google_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: googleCallback(), response_type: "code", scope: "openid email profile", state, access_type: "online", prompt: "select_account" });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get("/google/callback", asyncHandler(async (req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw badRequest("Google sign-in is not configured");
  const code = z.string().min(1).parse(req.query.code);
  const state = z.string().min(1).parse(req.query.state);
  if (!req.cookies.google_oauth_state || req.cookies.google_oauth_state !== state) throw unauthorized("Invalid Google sign-in session");
  res.clearCookie("google_oauth_state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: googleCallback(), grant_type: "authorization_code" }) });
  const tokens = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokens.access_token) throw unauthorized("Google sign-in could not be completed");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json() as { email?: string; email_verified?: boolean; name?: string; sub?: string };
  if (!profileResponse.ok || !profile.email || profile.email_verified === false) throw unauthorized("Google account email is not verified");

  const email = profile.email.trim().toLowerCase();
  let user = await User.findOne({ email }).exec();
  if (!user) {
    const baseUsername = (profile.name || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "growziauser";
    let username = baseUsername;
    let suffix = 1;
    while (await User.exists({ username })) username = `${baseUsername}${suffix++}`;
    user = await User.create({ email, username, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10), balanceKes: 0, isAdmin: email === env.ADMIN_EMAIL.toLowerCase() });
    sendEmailInBackground({ to: user.email, subject: "Welcome to Growzia", html: emailLayout("Welcome to Growzia", `<p>Hi ${user.username}, your Google account is now connected to Growzia.</p>`) });
  }
  if (user.isBanned) throw unauthorized("This account is suspended");
  const token = signAuthToken({ sub: String(user._id), email: user.email, role: user.isAdmin ? "admin" : "user" });
  const frontend = env.FRONTEND_ORIGIN.split(",")[0].replace(/\/$/, "");
  res.redirect(`${frontend}/dashboard?google_token=${encodeURIComponent(token)}`);
}));

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
    sendEmailInBackground({ to: user.email, subject: "Welcome to Growzia", html: emailLayout("Welcome to Growzia", `<p>Hi ${user.username}, your account is ready.</p><p>You can now explore services and grow your social presence.</p>`) });

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
