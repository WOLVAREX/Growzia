import { Schema, model, type Document, type Model, type Types } from "mongoose";
import type { ProviderCode } from "../services/providers/types";

export interface ProviderRawServiceDoc extends Document {
  _id: Types.ObjectId;
  providerCode: ProviderCode;
  providerServiceId: string;
  name: string;
  category: string;
  rawRate: number;
  rawCurrency: string;
  baseKesPer1000: number;
  min: number;
  max: number;
  platformId: string;
  serviceType: string;
  canonicalKey: string;
  isRegionVariant: boolean;
  syncedAt: Date;
}

const providerRawServiceSchema = new Schema<ProviderRawServiceDoc>(
  {
    providerCode: { type: String, required: true, enum: ["bwm", "cheapgains"], index: true },
    providerServiceId: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true, default: "" },
    rawRate: { type: Number, required: true },
    rawCurrency: { type: String, required: true, default: "KES" },
    baseKesPer1000: { type: Number, required: true },
    min: { type: Number, required: true, default: 1 },
    max: { type: Number, required: true, default: 1 },
    platformId: { type: String, required: true, default: "other" },
    serviceType: { type: String, required: true, default: "Other" },
    canonicalKey: { type: String, required: true, index: true },
    isRegionVariant: { type: Boolean, required: true, default: false },
    syncedAt: { type: Date, required: true, default: () => new Date(), index: true },
  },
  { collection: "provider_raw_services" },
);

providerRawServiceSchema.index({ providerCode: 1, providerServiceId: 1, syncedAt: -1 });

export const ProviderRawService: Model<ProviderRawServiceDoc> = model<ProviderRawServiceDoc>(
  "ProviderRawService",
  providerRawServiceSchema,
);
