import { correlationPrefix } from "./requestContext";

export type LogStatus = "debug" | "info" | "warn" | "error";

const LOG_LEVELS = ["silent", "debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogStatus, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && (LOG_LEVELS as readonly string[]).includes(raw)) return raw as LogLevel;
  if (process.env.NODE_ENV === "test") return "silent";
  return "silent";
}

function isEnabled(status: LogStatus): boolean {
  const configured = resolveLogLevel();
  if (configured === "silent") return false;
  return LEVEL_RANK[status] >= LEVEL_RANK[configured as LogStatus];
}

/**
 * Application-level dev debugger. Off by default (`LOG_LEVEL=silent`).
 *
 * Does NOT replace Prometheus metrics or Phoenix traces — LLM/tool/retrieval
 * observability stays in `obs/metrics.ts`, `obs/spans.ts`, and `obs/otel.ts`.
 * Set `LOG_LEVEL=debug` to trace HTTP routing, boot/shutdown, and app wiring.
 */
export function log(status: LogStatus, message: string): void {
  if (!isEnabled(status)) return;
  const line = `${correlationPrefix()}[${status}] ${message}`;
  if (status === "error") console.error(line);
  else if (status === "warn") console.warn(line);
  else console.log(line);
}

/** Shorthand helpers: `devLog.debug("server started")` */
export const devLog = {
  debug: (message: string) => log("debug", message),
  info: (message: string) => log("info", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
};
