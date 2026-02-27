import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    BROKER_HOST: z.string().default("0.0.0.0"),
    BROKER_PORT: z.coerce.number().default(8080),
    BROKER_URL: z.string().url().default("http://localhost:8080"),
    STORAGE_BACKEND: z.enum(["memory", "s3", "gcs"]).default("memory"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_PREFIX: z.string().optional(),
    GCS_BUCKET: z.string().optional(),
    GCS_PREFIX: z.string().optional(),
  },
  runtimeEnv: process.env,
});
