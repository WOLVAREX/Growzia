import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface AppSettingsDoc extends Document {
  _id: Types.ObjectId;
  key: string;
  value: unknown;
  updatedAt: Date;
  createdAt: Date;
}

const appSettingsSchema = new Schema<AppSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: "app_settings", minimize: false },
);

export const AppSettings: Model<AppSettingsDoc> = model<AppSettingsDoc>("AppSettings", appSettingsSchema);
