import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { notFound } from "../../lib/httpError";
import { User } from "../../models/User";
import { emailLayout, sendEmail } from "../../services/email";

const messageSchema = z.object({ subject: z.string().trim().min(1).max(160), message: z.string().trim().min(1).max(10000) });
const safe = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
export const adminEmailRouter = Router();

adminEmailRouter.post("/broadcast", asyncHandler(async (req, res) => {
  const body = messageSchema.parse(req.body);
  const users = await User.find({ isBanned: false }).select("email").lean().exec();
  const results = await Promise.allSettled(users.map(user => sendEmail({ to: user.email, subject: body.subject, html: emailLayout(body.subject, `<p>${safe(body.message).replace(/\n/g, "<br>")}</p>`) })));
  const failed = results.filter(result => result.status === "rejected").length;
  res.json({ attempted: users.length, sent: users.length - failed, failed });
}));

adminEmailRouter.post("/users/:id", asyncHandler(async (req, res) => {
  const body = messageSchema.parse(req.body);
  const user = await User.findById(req.params.id).select("email username").lean().exec();
  if (!user) throw notFound("User not found");
  await sendEmail({ to: user.email, subject: body.subject, html: emailLayout(body.subject, `<p>Hi ${safe(user.username)},</p><p>${safe(body.message).replace(/\n/g, "<br>")}</p>`) });
  res.json({ sent: true, email: user.email });
}));
