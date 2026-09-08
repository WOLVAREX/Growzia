import "dotenv/config";
import mongoose from "mongoose";
import { Pool } from "pg";

const mongoUri = process.env.MONGODB_URI;
const postgresUrl = process.env.DATABASE_URL;
if (!mongoUri) throw new Error("MONGODB_URI is required for migration");
if (!postgresUrl) throw new Error("DATABASE_URL is required for migration");

function serialise(value: unknown): unknown {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
  return value;
}

async function main(): Promise<void> {
  const mongo = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  const pool = new Pool({ connectionString: postgresUrl, ssl: postgresUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
  await pool.query("CREATE TABLE IF NOT EXISTS growzia_documents (collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id)); CREATE INDEX IF NOT EXISTS growzia_documents_collection_idx ON growzia_documents(collection);");
  const collections = await mongo.connection.db!.listCollections().toArray();
  let total = 0;
  for (const collection of collections) {
    if (collection.name.startsWith("system.")) continue;
    const documents = await mongo.connection.db!.collection(collection.name).find({}).toArray();
    for (const source of documents) {
      const data = serialise({ ...source, _id: source._id }) as Record<string, unknown>;
      const id = String(data._id);
      const createdAt = typeof data.createdAt === "string" ? data.createdAt : typeof data.syncedAt === "string" ? data.syncedAt : new Date().toISOString();
      const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : createdAt;
      await pool.query("INSERT INTO growzia_documents(collection,id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at", [collection.name, id, data, createdAt, updatedAt]);
      total += 1;
    }
    console.log(`Migrated ${documents.length} document(s) from ${collection.name}`);
  }
  console.log(`Migration complete: ${total} document(s)`);
  await pool.end();
  await mongo.disconnect();
}

main().catch(async error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
