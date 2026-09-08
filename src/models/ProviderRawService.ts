import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";
import type { ProviderCode } from "../services/providers/types";
export interface ProviderRawServiceDoc extends PgRecord { providerCode:ProviderCode; providerServiceId:string; name:string; category:string; rawRate:number; rawCurrency:string; baseKesPer1000:number; min:number; max:number; platformId:string; serviceType:string; canonicalKey:string; isRegionVariant:boolean; syncedAt:Date; }
const revive=(data:Record<string,unknown>):ProviderRawServiceDoc=>({...data,_id:new Types.ObjectId(String(data._id)),createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt)),syncedAt:new Date(String(data.syncedAt))} as ProviderRawServiceDoc);
export const ProviderRawService = new PgModel<ProviderRawServiceDoc>("provider_raw_services",revive);
