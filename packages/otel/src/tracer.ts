import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Tracer, Span } from "@opentelemetry/api";

const PKG_VERSION = "0.0.1";

export function createTracer(name: string): Tracer {
  return trace.getTracer(name, PKG_VERSION);
}

/**
 * Execute `fn` inside a new span. Automatically sets span status to ERROR
 * and records the exception if `fn` throws. Ends the span in all cases.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes: cleanAttributes(attributes) },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

function cleanAttributes(
  attrs: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}
