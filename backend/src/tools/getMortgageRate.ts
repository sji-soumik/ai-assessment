import { z } from "zod";

/**
 * getMortgageRate — the agent's only live tool (Phase 4).
 *
 * Source of truth for live numbers: the base rate and product quotes. Policy and
 * eligibility live in the knowledge base (the `retrieve` tool), never here.
 *
 * Backed by an in-process rate table (see docs/adr/0001-in-process-rate-table.md).
 * SWAP POINT: replace `RATE_TABLE`/`lookupRate` with a real rate feed behind the
 * same interface; callers and captured telemetry are unaffected.
 */

/** Percent APR by product then term (years). `base` is the lender reference rate. */
export const RATE_TABLE: Record<string, Record<number, number>> = {
  base: { 15: 5.5, 30: 6.0 },
  conventional: { 15: 5.85, 30: 6.35 },
  fha: { 15: 5.6, 30: 6.1 },
  va: { 15: 5.45, 30: 5.95 },
};

export const DEFAULT_PRODUCT = "base";
export const DEFAULT_TERM_YEARS = 30;

export const mortgageRateArgsSchema = z.object({
  product: z
    .string()
    .optional()
    .describe(
      "Loan product: base, conventional, fha, or va. Defaults to 'base' (the lender reference rate).",
    ),
  termYears: z
    .number()
    .optional()
    .describe("Loan term in years, e.g. 15 or 30. Defaults to 30."),
});

export type MortgageRateArgs = z.infer<typeof mortgageRateArgsSchema>;

/** Tool spec used to bind the tool onto the chat model. */
export const MORTGAGE_RATE_TOOL = {
  name: "getMortgageRate",
  description:
    "Get the current live mortgage rate. Use for any question about the base rate or a " +
    "product's rate. Omit arguments for the current base rate. Provide product " +
    "(base, conventional, fha, va) and termYears (15 or 30) for a specific quote.",
  schema: mortgageRateArgsSchema,
} as const;

export interface RateQuote {
  product: string;
  termYears: number;
  ratePercent: number;
  asOf: string; // ISO timestamp of the quote
}

export class RateNotFoundError extends Error {
  constructor(product: string, termYears: number) {
    const products = Object.keys(RATE_TABLE).join(", ");
    super(
      `No rate for product="${product}" term=${termYears}y. ` +
        `Known products: ${products}. Known terms: 15, 30.`,
    );
    this.name = "RateNotFoundError";
  }
}

/** Apply defaults and normalise loosely-typed tool arguments. */
export function normalizeArgs(args: MortgageRateArgs = {}): {
  product: string;
  termYears: number;
} {
  const product = (args.product ?? DEFAULT_PRODUCT).trim().toLowerCase();
  const termYears = args.termYears ?? DEFAULT_TERM_YEARS;
  return { product: product || DEFAULT_PRODUCT, termYears };
}

/**
 * Look up a live rate. Throws RateNotFoundError for unknown product/term so the
 * caller can surface a recoverable tool error (the request still completes).
 */
export function getMortgageRate(args: MortgageRateArgs = {}): RateQuote {
  const { product, termYears } = normalizeArgs(args);
  const ratePercent = RATE_TABLE[product]?.[termYears];
  if (ratePercent === undefined) throw new RateNotFoundError(product, termYears);
  return { product, termYears, ratePercent, asOf: new Date().toISOString() };
}
