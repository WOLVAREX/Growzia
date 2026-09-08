import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";

export interface UserDoc extends PgRecord {
  email: string; username: string; passwordHash: string; balanceKes: number; isBanned: boolean; isAdmin: boolean;
  apiKeyHash: string | null; apiKeyPrefix: string | null; apiKeyActive: boolean; apiKeyLastUsedAt: Date | null; apiKeyCallCount: number;
}

function revive(data: Record<string, unknown>): UserDoc {
  return { ...data, _id: new Types.ObjectId(String(data._id)), createdAt: new Date(String(data.createdAt)), updatedAt: new Date(String(data.updatedAt)), apiKeyLastUsedAt: data.apiKeyLastUsedAt ? new Date(String(data.apiKeyLastUsedAt)) : null } as UserDoc;
}

export const User = new PgModel<UserDoc>("users", revive);

export async function debitUserBalanceIfSufficient(userId: Types.ObjectId, amountKes: number): Promise<UserDoc | null> {
  return User.debitBalanceIfSufficient(userId, amountKes) as Promise<UserDoc | null>;
}
