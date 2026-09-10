import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRODUCT,
  DEFAULT_TERM_YEARS,
  getMortgageRate,
  lookupRate,
  normalizeArgs,
  RateNotFoundError,
  RATE_TABLE,
} from "../src/tools/getMortgageRate";
import { TOOL_CONNECTION_REFUSED } from "../src/chaos";
import { runWithRequestContextAsync } from "../src/obs/requestContext";

describe("getMortgageRate", () => {
  test("no args → base product, 30-year term (Phase 2 acceptance question)", () => {
    const quote = lookupRate();
    expect(quote.product).toBe(DEFAULT_PRODUCT);
    expect(quote.termYears).toBe(DEFAULT_TERM_YEARS);
    expect(quote.ratePercent).toBe(RATE_TABLE.base![30]!);
    expect(quote.asOf).toBeTruthy();
  });

  test("specific product and term", () => {
    const quote = lookupRate({ product: "fha", termYears: 15 });
    expect(quote.ratePercent).toBe(RATE_TABLE.fha![15]!);
  });

  test("product is normalised (case/whitespace)", () => {
    expect(lookupRate({ product: "  FHA  " }).product).toBe("fha");
  });

  test("unknown product throws RateNotFoundError", () => {
    expect(() => lookupRate({ product: "jumbo" })).toThrow(RateNotFoundError);
  });

  test("unknown term throws RateNotFoundError", () => {
    expect(() => lookupRate({ termYears: 40 })).toThrow(RateNotFoundError);
  });

  test("normalizeArgs applies defaults", () => {
    expect(normalizeArgs()).toEqual({ product: DEFAULT_PRODUCT, termYears: DEFAULT_TERM_YEARS });
    expect(normalizeArgs({ product: "", termYears: 15 })).toEqual({
      product: DEFAULT_PRODUCT,
      termYears: 15,
    });
  });

  test("public getMortgageRate matches lookup when chaos is off", async () => {
    const quote = await getMortgageRate();
    expect(quote.ratePercent).toBe(RATE_TABLE.base![30]!);
  });
});

describe("Phase 14 tool chaos", () => {
  test("tool_failure throws Connection refused", async () => {
    await runWithRequestContextAsync(
      { requestId: "req-fail", scenario: "tool_failure" },
      async () => {
        await expect(getMortgageRate()).rejects.toThrow(TOOL_CONNECTION_REFUSED);
      },
    );
  });

  test("slow_tool honors a short test delay", async () => {
    const started = performance.now();
    await runWithRequestContextAsync(
      { requestId: "req-slow", scenario: "slow_tool", chaosOverrides: { toolDelayMs: 25 } },
      async () => {
        const quote = await getMortgageRate({ product: "fha", termYears: 30 });
        expect(quote.ratePercent).toBe(RATE_TABLE.fha![30]!);
      },
    );
    expect(performance.now() - started).toBeGreaterThanOrEqual(20);
  });
});
