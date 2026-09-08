import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";
import type { ProviderCode } from "../services/providers/types";
export interface ServiceCatalogDoc extends PgRecord { canonicalKey:string; platformId:string; serviceType:string; name:string; category:string; providerCode:ProviderCode; providerServiceId:string; baseKesPer1000:number; sellKesPer1000:number; sellPriceOverrideKesPer1000?:number; min:number; max:number; isRegionVariant:boolean; isDisabled:boolean; }
const revive=(data:Record<string,unknown>):ServiceCatalogDoc=>({...data,_id:new Types.ObjectId(String(data._id)),createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt))} as ServiceCatalogDoc);
export const ServiceCatalog = new PgModel<ServiceCatalogDoc>("service_catalog",revive);
