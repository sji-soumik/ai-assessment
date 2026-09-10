import { diag, DiagConsoleLogger, DiagLogLevel, trace } from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "ai-assessment-agent";
const SERVICE_VERSION = "0.1.0";

let provider: NodeTracerProvider | undefined;
let initialized = false;

export interface TelemetryOptions {
  /** Skip SDK registration (tests that manage their own provider). */
  disabled?: boolean;
  /** Override OTLP / in-memory exporter (tests). */
  exporter?: SpanExporter;
  /** Use SimpleSpanProcessor for synchronous export in tests. Default: batch. */
  processor?: "batch" | "simple";
}

/**
 * Register the OpenTelemetry tracer provider once per process.
 * Exports to Phoenix via OTLP HTTP protobuf (Phoenix rejects application/json with 415).
 */
export function initTelemetry(options: TelemetryOptions = {}): void {
  if (initialized) return;

  if (options.disabled || process.env.OTEL_SDK_DISABLED === "true") {
    initialized = true;
    return;
  }

  if (process.env.OTEL_LOG_LEVEL === "debug") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const exporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:6006/v1/traces",
    });

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    spanProcessors: [
      options.processor === "simple"
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter),
    ],
  });

  provider.register();
  initialized = true;
}

/** Flush and shut down the SDK (graceful server exit / test teardown). */
export async function shutdownTelemetry(): Promise<void> {
  if (!provider) return;
  await provider.shutdown();
  provider = undefined;
  initialized = false;
}

/** Tracer used by all explicit withSpan wrappers. */
export function getTracer() {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/** Current trace id hex string, when inside an active span. */
export function currentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  return span.spanContext().traceId;
}

/** Force-flush pending spans (call before reading in-memory export in tests). */
export async function flushTelemetry(): Promise<void> {
  await provider?.forceFlush();
}

export { SERVICE_NAME, SERVICE_VERSION };
