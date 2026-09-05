import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  mongoose.set("strictQuery", true);
  connecting = mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });

  try {
    const conn = await connecting;
    logger.info(`MongoDB connected to database "${conn.connection.name}"`);
    return conn;
  } finally {
    connecting = null;
  }
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}
