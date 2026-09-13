import { afterEach, describe, expect, test } from "bun:test";
import { log } from "../src/obs/logger";
import { runWithRequestContext } from "../src/obs/requestContext";

describe("log", () => {
  const prevLevel = process.env.LOG_LEVEL;
  const lines: string[] = [];
  const origLog = console.log;

  afterEach(() => {
    if (prevLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prevLevel;
    console.log = origLog;
    lines.length = 0;
  });

  test("prints [status] message when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    console.log = (...args: unknown[]) => lines.push(String(args[0]));

    runWithRequestContext({ requestId: "req-test-123" }, () => {
      log("debug", "server started");
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("[req=req-test-123] [debug] server started");
  });

  test("is silent when LOG_LEVEL=silent", () => {
    process.env.LOG_LEVEL = "silent";
    console.log = (...args: unknown[]) => lines.push(String(args[0]));

    log("info", "should not print");
    expect(lines).toHaveLength(0);
  });

  test("filters below configured level", () => {
    process.env.LOG_LEVEL = "warn";
    console.log = (...args: unknown[]) => lines.push(String(args[0]));
    console.warn = (...args: unknown[]) => lines.push(String(args[0]));

    log("debug", "hidden");
    log("info", "hidden");
    log("warn", "visible");

    expect(lines).toEqual(["[warn] visible"]);
  });
});
