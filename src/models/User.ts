import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  email: string;
  username: string;
  passwordHash: string;
  balanceKes: number;
  isBanned: boolean;
  isAdmin: boolean;
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  apiKeyActive: boolean;
  apiKeyLastUsedAt: Date | null;
  apiKeyCallCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    balanceKes: { type: Number, required: true, default: 0, min: 0 },
    isBanned: { type: Boolean, required: true, default: false, index: true },
    isAdmin: { type: Boolean, required: true, default: false },
    apiKeyHash: { type: String, default: null, index: true },
    apiKeyPrefix: { type: String, default: null },
    apiKeyActive: { type: Boolean, required: true, default: false },
    apiKeyLastUsedAt: { type: Date, default: null },
    apiKeyCallCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "users" },
);

export const User: Model<UserDoc> = model<UserDoc>("User", userSchema);
