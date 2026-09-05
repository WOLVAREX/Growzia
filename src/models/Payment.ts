import { Schema, model, type Document, type Model, type Types } from "mongoose";
export type PaymentStatus = "pending" | "success" | "failed";
export interface PaymentDoc extends Document { _id: Types.ObjectId; userId: Types.ObjectId; reference: string; amountKes: number; currency: string; method: "card" | "mpesa"; status: PaymentStatus; paystackTransactionId: string | null; gatewayResponse: string | null; creditedAt: Date | null; createdAt: Date; updatedAt: Date; }
const paymentSchema = new Schema<PaymentDoc>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, reference: { type: String, required: true, unique: true, index: true }, amountKes: { type: Number, required: true, min: 1 }, currency: { type: String, required: true, default: "KES" }, method: { type: String, required: true, enum: ["card", "mpesa"], default: "card" }, status: { type: String, required: true, enum: ["pending", "success", "failed"], default: "pending", index: true }, paystackTransactionId: { type: String, default: null }, gatewayResponse: { type: String, default: null }, creditedAt: { type: Date, default: null },
}, { timestamps: true, collection: "payments" });
paymentSchema.index({ userId: 1, createdAt: -1 });
export const Payment: Model<PaymentDoc> = model<PaymentDoc>("Payment", paymentSchema);
