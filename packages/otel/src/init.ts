import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";
import type { OtelConfig } from "./config.js";
import { resolveConfig } from "./config.js";

let sdk: NodeSDK | null = null;

/**
 * Optional convenience to initialize the OpenTelemetry SDK.
 *
 * Call this before starting your broker or worker **only if you do not
 * already have your own OTel SDK setup**. If you register a
 * TracerProvider yourself, skip this function entirely — the library
 * spans created by osqueue packages will participate in your existing
 * trace context automatically.
 *
 * When `OTEL_ENABLED` is not `"true"` (or `config.enabled` is false),
 * this function is a no-op and returns `undefined`.
 */
export function initTelemetry(
  overrides?: Partial<OtelConfig>,
): NodeSDK | undefined {
  const config = resolveConfig(overrides);

  if (!config.enabled) {
    return undefined;
  }

  if (sdk) {
    return sdk;
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
  });

  const traceExporter = config.traces
    ? new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` })
    : undefined;

  const metricReader = config.metrics
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${config.endpoint}/v1/metrics`,
        }),
      })
    : undefined;

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
  });

  sdk.start();

  console.log(
    `[otel] Telemetry enabled — service=${config.serviceName} endpoint=${config.endpoint} traces=${config.traces} metrics=${config.metrics}`,
  );

  return sdk;
}

/**
 * Gracefully shut down the OpenTelemetry SDK, flushing any pending telemetry.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
