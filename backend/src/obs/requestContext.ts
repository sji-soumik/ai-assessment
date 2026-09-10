import { AsyncLocalStorage } from "node:async_hooks";
import type { ChaosOverrides, ChaosScenario } from "../chaos";

/**
 * Per-request correlation (Phase 15). Request ID is the caller's id;
 * trace ID / span IDs come from OpenTelemetry once the root span starts.
 */
export interface RequestContext {
  requestId: string;
  scenario?: ChaosScenario;
  /** Test-only knobs (short delays, skip the 80k live pad). */
  chaosOverrides?: ChaosOverrides;
}

const storage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/** Accept a well-formed inbound id, otherwise mint `req-<uuid>`. */
export function resolveRequestId(raw: unknown): string {
  if (typeof raw === "string" && REQUEST_ID_RE.test(raw)) return raw;
  return `req-${crypto.randomUUID()}`;
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export async function runWithRequestContextAsync<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

/** Prefix for console logs: `[req=… trace=…] `. Empty when no context. */
export function correlationPrefix(traceId?: string): string {
  const req = currentRequestId();
  const parts: string[] = [];
  if (req) parts.push(`req=${req}`);
  if (traceId) parts.push(`trace=${traceId}`);
  return parts.length > 0 ? `[${parts.join(" ")}] ` : "";
}
