import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";
export interface SyncLogDoc extends PgRecord { startedAt:Date; finishedAt:Date|null; bwmCount:number; cheapgainsCount:number; mergedCount:number; removedCount:number; marginPercent:number; errors:string[]; triggeredBy:"cron"|"admin"|"startup"; }
const revive=(data:Record<string,unknown>):SyncLogDoc=>({...data,_id:new Types.ObjectId(String(data._id)),createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt)),startedAt:new Date(String(data.startedAt)),finishedAt:data.finishedAt?new Date(String(data.finishedAt)):null} as SyncLogDoc);
export const SyncLog = new PgModel<SyncLogDoc>("sync_logs",revive);
