import { z } from "zod";

const envSchema = z.object({
  BROKER_HOST: z.string().default("0.0.0.0"),
  BROKER_PORT: z.coerce.number().default(8080),
  BROKER_URL: z.string().url().default("http://localhost:8080"),
  STORAGE_BACKEND: z.enum(["memory", "s3", "gcs"]).default("memory"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PREFIX: z.string().optional(),
  GCS_BUCKET: z.string().optional(),
  GCS_PREFIX: z.string().optional(),
  GROUP_COMMIT_INTERVAL_MS: z.coerce.number().default(50),
  BROKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(3000),
  S3_MAX_READS_PER_MINUTE: z.coerce.number().default(0),
  S3_MAX_WRITES_PER_MINUTE: z.coerce.number().default(0),
  S3_MAX_WRITES_PER_DAY: z.coerce.number().default(0),
  BROKER_HEARTBEAT_TIMEOUT_MS: z.coerce.number().default(10_000),
});

export const env = envSchema.parse(process.env);
