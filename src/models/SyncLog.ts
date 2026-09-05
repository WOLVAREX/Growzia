import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface SyncLogDoc extends Omit<Document, "errors"> {
  _id: Types.ObjectId;
  startedAt: Date;
  finishedAt: Date | null;
  bwmCount: number;
  cheapgainsCount: number;
  mergedCount: number;
  removedCount: number;
  marginPercent: number;
  errors: string[];
  triggeredBy: "cron" | "admin" | "startup";
}

const syncLogSchema = new Schema<SyncLogDoc>(
  {
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    bwmCount: { type: Number, required: true, default: 0 },
    cheapgainsCount: { type: Number, required: true, default: 0 },
    mergedCount: { type: Number, required: true, default: 0 },
    removedCount: { type: Number, required: true, default: 0 },
    marginPercent: { type: Number, required: true, default: 0 },
    errors: { type: [String], required: true, default: [] },
    triggeredBy: { type: String, required: true, enum: ["cron", "admin", "startup"], default: "cron" },
  },
  { collection: "sync_logs", suppressReservedKeysWarning: true },
);

export const SyncLog: Model<SyncLogDoc> = model<SyncLogDoc>("SyncLog", syncLogSchema);
