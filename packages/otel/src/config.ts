export interface OtelConfig {
  /** Whether OpenTelemetry is enabled. Default: false */
  enabled: boolean;
  /** Service name reported to the collector. Default: "osqueue" */
  serviceName: string;
  /**
   * OTLP endpoint for sending telemetry data.
   * Default: "http://localhost:4318"
   */
  endpoint: string;
  /** Whether to enable trace collection. Default: true */
  traces: boolean;
  /** Whether to enable metric collection. Default: true */
  metrics: boolean;
}

export function resolveConfig(
  overrides?: Partial<OtelConfig>,
): OtelConfig {
  return {
    enabled:
      overrides?.enabled ?? process.env.OTEL_ENABLED === "true",
    serviceName:
      overrides?.serviceName ??
      process.env.OTEL_SERVICE_NAME ??
      "osqueue",
    endpoint:
      overrides?.endpoint ??
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      "http://localhost:4318",
    traces: overrides?.traces ?? process.env.OTEL_TRACES_ENABLED !== "false",
    metrics:
      overrides?.metrics ?? process.env.OTEL_METRICS_ENABLED !== "false",
  };
}
