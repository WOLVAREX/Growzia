import { Pool } from "pg";
import { Types } from "mongoose";
import { env } from "./env";

export type PgFilter = Record<string, unknown>;
export type PgUpdate = Record<string, unknown>;
export type PgRecord = { _id: Types.ObjectId; createdAt: Date; updatedAt: Date; save(): Promise<unknown> };
export type PgEntity<T extends PgRecord> = T & { save(): Promise<PgEntity<T>> };

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, ssl: env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });

export async function ensurePgSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS growzia_documents (collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id)); CREATE INDEX IF NOT EXISTS growzia_documents_collection_idx ON growzia_documents(collection);`);
}

function plain(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

function getValue(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, data);
}

function equal(left: unknown, right: unknown): boolean { return String(left) === String(plain(right)); }
function matches(data: Record<string, unknown>, filter: PgFilter): boolean {
  if (filter.$or && Array.isArray(filter.$or) && !filter.$or.some(item => matches(data, item as PgFilter))) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") continue;
    const actual = getValue(data, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected) && Object.keys(expected as Record<string, unknown>).some(key => key.startsWith("$"))) {
      const operators = expected as Record<string, unknown>;
      if ("$in" in operators && !(operators.$in as unknown[]).some(item => equal(actual, item))) return false;
      if ("$nin" in operators && (operators.$nin as unknown[]).some(item => equal(actual, item))) return false;
      if ("$gte" in operators && !(actual !== undefined && String(actual) >= String(plain(operators.$gte)))) return false;
      if ("$lte" in operators && !(actual !== undefined && String(actual) <= String(plain(operators.$lte)))) return false;
      if ("$gt" in operators && !(actual !== undefined && String(actual) > String(plain(operators.$gt)))) return false;
      if ("$lt" in operators && !(actual !== undefined && String(actual) < String(plain(operators.$lt)))) return false;
    } else if (!equal(actual, expected)) return false;
  }
  return true;
}

function applyUpdate(data: Record<string, unknown>, update: PgUpdate): Record<string, unknown> {
  const next = { ...data };
  const set = (update.$set as Record<string, unknown> | undefined) ?? update;
  for (const [key, value] of Object.entries(set)) if (!key.startsWith("$")) next[key] = plain(value);
  for (const [key, value] of Object.entries((update.$inc as Record<string, number> | undefined) ?? {})) next[key] = Number(next[key] ?? 0) + value;
  return next;
}

export class PgDocument<T extends PgRecord> {
  [key: string]: unknown;
  constructor(public readonly collection: string, public data: T) { Object.assign(this, data); }
  async save(): Promise<this> { const now = new Date(); this.data = { ...this.data, ...Object.fromEntries(Object.keys(this.data).map(key => [key, this[key]])), updatedAt: now } as T; Object.assign(this, this.data); await pool.query("UPDATE growzia_documents SET data=$3, updated_at=$4 WHERE collection=$1 AND id=$2", [this.collection, String(this.data._id), plain(this.data), now]); return this; }
}

class Query<T> {
  private sortSpec: Record<string, 1 | -1> = {}; private skipCount = 0; private limitCount = 0;
  constructor(private readonly run: () => Promise<T>) {}
  select(_fields: string): this { return this; }
  lean(): this { return this; }
  sort(spec: Record<string, 1 | -1>): this { this.sortSpec = spec; return this; }
  skip(count: number): this { this.skipCount = count; return this; }
  limit(count: number): this { this.limitCount = count; return this; }
  populate<U = unknown>(_path: string, _select?: string): Query<T & U> { return this as unknown as Query<T & U>; }
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return this.exec().then(onfulfilled, onrejected); }
  async exec(): Promise<T> { const result = await this.run(); if (!Array.isArray(result)) return result; const sorted = [...result].sort((a,b) => { for (const [key, direction] of Object.entries(this.sortSpec)) { const av = (a as Record<string, unknown>)[key]; const bv = (b as Record<string, unknown>)[key]; if (String(av) !== String(bv)) return (String(av) < String(bv) ? -1 : 1) * direction; } return 0; }); const sliced = sorted.slice(this.skipCount, this.limitCount ? this.skipCount + this.limitCount : undefined); return (sliced as T); }
}

export class PgModel<T extends PgRecord> {
  constructor(public readonly collection: string, private readonly revive: (data: Record<string, unknown>) => T) {}
  private doc(data: Record<string, unknown>): PgDocument<T> { return new PgDocument(this.collection, this.revive(data)); }
  private async rows(filter: PgFilter): Promise<PgDocument<T>[]> { const result = await pool.query<{ data: Record<string, unknown> }>("SELECT data FROM growzia_documents WHERE collection=$1", [this.collection]); return result.rows.filter(row => matches(row.data, filter)).map(row => this.doc(row.data)); }
  find(filter: PgFilter = {}): Query<PgEntity<T>[]> { return new Query(async () => (await this.rows(filter)) as unknown as PgEntity<T>[]); }
  findOne(filter: PgFilter = {}): Query<PgEntity<T> | null> { return new Query(async () => (await this.rows(filter))[0] as unknown as PgEntity<T> ?? null); }
  findById(id: unknown): Query<PgEntity<T> | null> { return this.findOne({ _id: id }); }
  async create(input: Partial<T>): Promise<PgEntity<T>> { const id = input._id ? String(input._id) : new Types.ObjectId().toHexString(); const now = new Date(); const data = { ...input, _id: id, createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now } as Record<string, unknown>; await pool.query("INSERT INTO growzia_documents(collection,id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5)", [this.collection, id, plain(data), data.createdAt, data.updatedAt]); return this.doc(data) as unknown as PgEntity<T>; }
  async debitBalanceIfSufficient(id: unknown, amount: number): Promise<PgEntity<T> | null> {
    const result = await pool.query<{ data: Record<string, unknown> }>(
      "UPDATE growzia_documents SET data=jsonb_set(data, '{balanceKes}', to_jsonb(((data->>'balanceKes')::numeric - $3)), true), updated_at=now() WHERE collection=$1 AND id=$2 AND COALESCE((data->>'balanceKes')::numeric, 0) >= $3 RETURNING data",
      [this.collection, String(id), amount],
    );
    return result.rows[0] ? this.doc(result.rows[0].data) as unknown as PgEntity<T> : null;
  }
  async insertMany(inputs: Array<Partial<T>>, _options?: unknown): Promise<PgEntity<T>[]> { const output: PgEntity<T>[] = []; for (const input of inputs) output.push(await this.create(input)); return output; }
  countDocuments(filter: PgFilter = {}): Query<number> { return new Query(async () => (await this.rows(filter)).length); }
  exists(filter: PgFilter): Query<boolean> { return new Query(async () => (await this.rows(filter)).length > 0); }
  updateOne(filter: PgFilter, update: PgUpdate): Query<{ matchedCount: number }> { return new Query(async () => { const row = (await this.rows(filter))[0]; if (!row) return { matchedCount: 0 }; await this.write(row, applyUpdate(row.data, update)); return { matchedCount: 1 }; }); }
  updateMany(filter: PgFilter, update: PgUpdate): Query<{ matchedCount: number }> { return new Query(async () => { const rows = await this.rows(filter); for (const row of rows) await this.write(row, applyUpdate(row.data, update)); return { matchedCount: rows.length }; }); }
  findOneAndUpdate(filter: PgFilter, update: PgUpdate, options: { upsert?: boolean; new?: boolean; runValidators?: boolean } = {}): Query<PgEntity<T> | null> { return new Query(async () => { const row = (await this.rows(filter))[0]; if (!row && options.upsert) return this.create(applyUpdate(filter as Partial<T>, update) as Partial<T>); if (!row) return null; await this.write(row, applyUpdate(row.data, update)); return row as unknown as PgEntity<T>; }); }
  findByIdAndUpdate(id: unknown, update: PgUpdate, options: { upsert?: boolean; new?: boolean; runValidators?: boolean } = {}): Query<PgEntity<T> | null> { return this.findOneAndUpdate({ _id: id }, update, options); }
  deleteMany(filter: PgFilter): Query<{ deletedCount: number }> { return new Query(async () => { const rows = await this.rows(filter); for (const row of rows) await pool.query("DELETE FROM growzia_documents WHERE collection=$1 AND id=$2", [this.collection, String(row.data._id)]); return { deletedCount: rows.length }; }); }
  async bulkWrite(operations: Array<{ updateOne: { filter: PgFilter; update: PgUpdate; upsert?: boolean } }>, _options?: unknown): Promise<void> { for (const operation of operations) await this.findOneAndUpdate(operation.updateOne.filter, operation.updateOne.update, { upsert: operation.updateOne.upsert }); }
  aggregate<U = Record<string, unknown>>(pipeline: Array<Record<string, unknown>>): Query<U[]> { return new Query(async () => { let rows: Record<string, unknown>[] = (await this.rows({})).map(row => row.data as unknown as Record<string, unknown>); for (const stage of pipeline) { if (stage.$match) rows = rows.filter(row => matches(row, stage.$match as PgFilter)); if (stage.$group) { const group = stage.$group as Record<string, unknown>; const grouped = new Map<string, Record<string, unknown>>(); for (const row of rows) { const idExpression = String(group._id ?? ""); const idKey = idExpression.startsWith("$") ? String(getValue(row, idExpression.slice(1))) : idExpression; const target = grouped.get(idKey) ?? { _id: idExpression.startsWith("$") ? getValue(row, idExpression.slice(1)) : group._id }; for (const [key, expression] of Object.entries(group)) { if (key === "_id") continue; const sum = (expression as Record<string, unknown>).$sum; target[key] = Number(target[key] ?? 0) + (Number(sum) === 1 ? 1 : Number(getValue(row, String(sum).replace(/^\$/, "")) ?? 0)); } grouped.set(idKey, target); } rows = Array.from(grouped.values()); } } return rows as unknown as U[]; }); }
  private async write(row: PgDocument<T>, data: Record<string, unknown>): Promise<void> { const now = new Date(); data.updatedAt = now.toISOString(); await pool.query("UPDATE growzia_documents SET data=$3,updated_at=$4 WHERE collection=$1 AND id=$2", [this.collection, String(data._id), plain(data), now]); Object.assign(row, this.revive(data)); row.data = this.revive(data); }
}
