import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";
export interface AppSettingsDoc extends PgRecord { key:string; value:unknown; }
const revive=(data:Record<string,unknown>):AppSettingsDoc=>({...data,_id:new Types.ObjectId(String(data._id)),createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt))} as AppSettingsDoc);
export const AppSettings = new PgModel<AppSettingsDoc>("app_settings",revive);
