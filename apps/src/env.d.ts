export declare const env: Readonly<{
    BROKER_HOST: string;
    BROKER_PORT: number;
    BROKER_URL: string;
    STORAGE_BACKEND: "memory" | "s3" | "gcs";
    S3_BUCKET?: string | undefined;
    S3_REGION?: string | undefined;
    S3_PREFIX?: string | undefined;
    GCS_BUCKET?: string | undefined;
    GCS_PREFIX?: string | undefined;
}>;
