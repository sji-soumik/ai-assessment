import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRODUCT,
  DEFAULT_TERM_YEARS,
  getMortgageRate,
  normalizeArgs,
  RateNotFoundError,
  RATE_TABLE,
} from "../src/tools/getMortgageRate";

describe("getMortgageRate", () => {
  test("no args → base product, 30-year term (Phase 2 acceptance question)", () => {
    const quote = getMortgageRate();
    expect(quote.product).toBe(DEFAULT_PRODUCT);
    expect(quote.termYears).toBe(DEFAULT_TERM_YEARS);
    expect(quote.ratePercent).toBe(RATE_TABLE.base![30]!);
    expect(quote.asOf).toBeTruthy();
  });

  test("specific product and term", () => {
    const quote = getMortgageRate({ product: "fha", termYears: 15 });
    expect(quote.ratePercent).toBe(RATE_TABLE.fha![15]!);
  });

  test("product is normalised (case/whitespace)", () => {
    expect(getMortgageRate({ product: "  FHA  " }).product).toBe("fha");
  });

  test("unknown product throws RateNotFoundError", () => {
    expect(() => getMortgageRate({ product: "jumbo" })).toThrow(RateNotFoundError);
  });

  test("unknown term throws RateNotFoundError", () => {
    expect(() => getMortgageRate({ termYears: 40 })).toThrow(RateNotFoundError);
  });

  test("normalizeArgs applies defaults", () => {
    expect(normalizeArgs()).toEqual({ product: DEFAULT_PRODUCT, termYears: DEFAULT_TERM_YEARS });
    expect(normalizeArgs({ product: "", termYears: 15 })).toEqual({
      product: DEFAULT_PRODUCT,
      termYears: 15,
    });
  });
});
