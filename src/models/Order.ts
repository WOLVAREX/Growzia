import { Schema, model, type Document, type Model, type Types } from "mongoose";
import type { ProviderCode } from "../services/providers/types";

export type OrderStatus = "pending" | "processing" | "completed" | "partial" | "failed" | "refunded";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "processing",
  "completed",
  "partial",
  "failed",
  "refunded",
];

export interface OrderDoc extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  serviceCatalogId: Types.ObjectId;
  serviceName: string;
  platformId: string;
  serviceType: string;
  link: string;
  quantity: number;
  costKes: number;
  costCurrency: string;
  costInSelectedCurrency: number;
  providerCode: ProviderCode;
  providerServiceId: string;
  providerOrderId: string | null;
  status: OrderStatus;
  startCount: number | null;
  remains: number | null;
  failureReason: string | null;
  lastStatusCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<OrderDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    serviceCatalogId: { type: Schema.Types.ObjectId, ref: "ServiceCatalog", required: true },
    serviceName: { type: String, required: true },
    platformId: { type: String, required: true, default: "other" },
    serviceType: { type: String, required: true, default: "Other" },
    link: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    costKes: { type: Number, required: true, min: 0 },
    costCurrency: { type: String, required: true, default: "KES" },
    costInSelectedCurrency: { type: Number, required: true, min: 0 },
    providerCode: { type: String, required: true, enum: ["bwm", "cheapgains"], select: false },
    providerServiceId: { type: String, required: true, select: false },
    providerOrderId: { type: String, default: null, select: false },
    status: { type: String, required: true, enum: ORDER_STATUSES, default: "pending", index: true },
    startCount: { type: Number, default: null },
    remains: { type: Number, default: null },
    failureReason: { type: String, default: null },
    lastStatusCheckAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "orders" },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ providerOrderId: 1 });

export const Order: Model<OrderDoc> = model<OrderDoc>("Order", orderSchema);
