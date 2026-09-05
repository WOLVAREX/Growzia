import { Router } from "express";
import { Types, type FilterQuery } from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest, notFound } from "../../lib/httpError";
import { User, type UserDoc } from "../../models/User";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  banned: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const balanceSchema = z.object({ amountKes: z.coerce.number() });

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const adminUsersRouter = Router();

adminUsersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listSchema.parse(req.query);
    const filter: FilterQuery<UserDoc> = {};
    if (query.banned) filter.isBanned = query.banned === "true";
    if (query.q) {
      const regex = { $regex: escapeRegex(query.q), $options: "i" };
      filter.$or = [{ email: regex }, { username: regex }];
    }

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      User.find(filter)
        .select("email username balanceKes isBanned isAdmin apiKeyPrefix apiKeyActive apiKeyCallCount createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      User.countDocuments(filter).exec(),
    ]);

    res.json({
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
      users: docs.map((doc) => ({
        id: String(doc._id),
        email: doc.email,
        username: doc.username,
        balanceKes: doc.balanceKes,
        isBanned: doc.isBanned,
        isAdmin: doc.isAdmin,
        apiKeyPrefix: doc.apiKeyPrefix,
        apiKeyActive: doc.apiKeyActive,
        apiKeyCallCount: doc.apiKeyCallCount,
        createdAt: doc.createdAt,
      })),
    });
  }),
);

async function setBanned(id: string, isBanned: boolean): Promise<UserDoc> {
  if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid user id");
  const user = await User.findByIdAndUpdate(id, { $set: { isBanned } }, { new: true }).exec();
  if (!user) throw notFound("User not found");
  return user;
}

async function setAdmin(id: string, isAdmin: boolean): Promise<UserDoc> {
  if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid user id");
  const user = await User.findByIdAndUpdate(id, { $set: { isAdmin } }, { new: true }).exec();
  if (!user) throw notFound("User not found");
  return user;
}

adminUsersRouter.post(
  "/:id/ban",
  asyncHandler(async (req, res) => {
    const user = await setBanned(String(req.params.id ?? ""), true);
    res.json({ user: { id: String(user._id), isBanned: user.isBanned } });
  }),
);

adminUsersRouter.post(
  "/:id/unban",
  asyncHandler(async (req, res) => {
    const user = await setBanned(String(req.params.id ?? ""), false);
    res.json({ user: { id: String(user._id), isBanned: user.isBanned } });
  }),
);

adminUsersRouter.post(
  "/:id/admin",
  asyncHandler(async (req, res) => {
    const isAdmin = z.object({ isAdmin: z.boolean() }).parse(req.body).isAdmin;
    const user = await setAdmin(String(req.params.id ?? ""), isAdmin);
    res.json({ user: { id: String(user._id), isAdmin: user.isAdmin } });
  }),
);

adminUsersRouter.post(
  "/:id/balance",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) throw badRequest("Invalid user id");
    const body = balanceSchema.parse(req.body);

    const user = await User.findById(id).exec();
    if (!user) throw notFound("User not found");

    const next = Math.round((user.balanceKes + body.amountKes) * 100) / 100;
    if (next < 0) throw badRequest("Resulting balance cannot be negative");
    user.balanceKes = next;
    await user.save();

    res.json({ user: { id: String(user._id), balanceKes: user.balanceKes } });
  }),
);
