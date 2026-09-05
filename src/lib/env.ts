import "dotenv/config";
import { z } from "zod";

const numberFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === "" ? fallback : Number(value)))
    .refine((value) => Number.isFinite(value), { message: "must be a valid number" });

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  PORT: numberFromString(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),

  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email"),
  ADMIN_USERNAME: z.string().min(1, "ADMIN_USERNAME is required"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),

  BWM_API: z.string().min(1, "BWM_API is required"),
  BWM_API_URL: z.string().url("BWM_API_URL must be a valid URL").default("https://xmdapis.bwmxmd.co.ke/api"),
  CHEAPGAINS_API_KEY: z.string().min(1, "CHEAPGAINS_API_KEY is required"),
  CHEAPGAINS_API_URL: z
    .string()
    .url("CHEAPGAINS_API_URL must be a valid URL")
    .default("https://cheapgainske.co.ke/api/v2"),
  CHEAPGAINS_ACCOUNT_CURRENCY: z.string().min(3).default("KES"),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_CALLBACK_URL: z.string().url("PAYSTACK_CALLBACK_URL must be a valid URL").optional(),
  PAYSTACK_CURRENCY: z.string().min(3).default("KES"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url("GOOGLE_CALLBACK_URL must be a valid URL").optional(),

  DEFAULT_MARGIN_PERCENT: numberFromString(15),
  DEFAULT_CURRENCY: z.string().min(3).default("KES"),
  USD_TO_KES: numberFromString(130),

  CATALOGUE_SYNC_INTERVAL_MINUTES: numberFromString(30),
  ORDER_STATUS_SYNC_INTERVAL_MINUTES: numberFromString(10),
  PROVIDER_TIMEOUT_MS: numberFromString(20000),
  CATALOG_CACHE_TTL_SECONDS: numberFromString(300),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid or missing environment configuration:\n${details}`);
  }
  const value = parsed.data;
  if (value.USD_TO_KES <= 0) {
    throw new Error("Invalid or missing environment configuration:\n  - USD_TO_KES: must be greater than 0");
  }
  if (value.DEFAULT_MARGIN_PERCENT < 0) {
    throw new Error("Invalid or missing environment configuration:\n  - DEFAULT_MARGIN_PERCENT: must be zero or greater");
  }
  return value;
}

export const env: AppEnv = loadEnv();
export const isProduction = env.NODE_ENV === "production";
