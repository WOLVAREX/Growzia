import { Schema, model, type Document, type Model, type Types } from "mongoose";
import type { ProviderCode } from "../services/providers/types";

export interface ServiceCatalogDoc extends Document {
  _id: Types.ObjectId;
  canonicalKey: string;
  platformId: string;
  serviceType: string;
  name: string;
  category: string;
  providerCode: ProviderCode;
  providerServiceId: string;
  baseKesPer1000: number;
  sellKesPer1000: number;
  min: number;
  max: number;
  isRegionVariant: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const serviceCatalogSchema = new Schema<ServiceCatalogDoc>(
  {
    canonicalKey: { type: String, required: true, unique: true, index: true },
    platformId: { type: String, required: true, index: true },
    serviceType: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true, default: "" },
    providerCode: { type: String, required: true, enum: ["bwm", "cheapgains"], select: false },
    providerServiceId: { type: String, required: true, select: false },
    baseKesPer1000: { type: Number, required: true, select: false },
    sellKesPer1000: { type: Number, required: true },
    min: { type: Number, required: true, default: 1 },
    max: { type: Number, required: true, default: 1 },
    isRegionVariant: { type: Boolean, required: true, default: false },
    isDisabled: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true, collection: "service_catalog" },
);

serviceCatalogSchema.index({ name: "text", category: "text" });

export const ServiceCatalog: Model<ServiceCatalogDoc> = model<ServiceCatalogDoc>(
  "ServiceCatalog",
  serviceCatalogSchema,
);
