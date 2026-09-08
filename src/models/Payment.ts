import { Types } from "mongoose";
import { PgModel, type PgRecord } from "../lib/pgStore";
export type PaymentStatus = "pending"|"success"|"failed";
export interface PaymentDoc extends PgRecord { userId:Types.ObjectId; reference:string; amountKes:number; currency:string; method:"card"|"mpesa"; status:PaymentStatus; paystackTransactionId:string|null; gatewayResponse:string|null; creditedAt:Date|null; }
const revive=(data:Record<string,unknown>):PaymentDoc=>({...data,_id:new Types.ObjectId(String(data._id)),userId:new Types.ObjectId(String(data.userId)),createdAt:new Date(String(data.createdAt)),updatedAt:new Date(String(data.updatedAt)),creditedAt:data.creditedAt?new Date(String(data.creditedAt)):null} as PaymentDoc);
export const Payment = new PgModel<PaymentDoc>("payments",revive);
