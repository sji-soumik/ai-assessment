import { z } from "zod";
import { MORTGAGE_RATE_TOOL } from "../tools/getMortgageRate";
import { DEFAULT_TOP_K } from "../rag/search";

/**
 * Tool specs bound onto the chat model so it can decide when to retrieve policy
 * docs or look up a live rate. These are schemas only — execution happens in the
 * retrieval/tool graph nodes, which keeps capture (state.retrievals /
 * state.toolCalls) in one place.
 */
export const RETRIEVE_TOOL = {
  name: "retrieve",
  description:
    "Search the mortgage knowledge base for lending policy, product eligibility, " +
    "overlays, and underwriting rules. Use for 'how/why/what are the rules' questions. " +
    "Do NOT use for live numbers like the current base or product rate.",
  schema: z.object({
    query: z.string().describe("Natural-language search query for the knowledge base."),
    topK: z
      .number()
      .optional()
      .describe(`Number of chunks to retrieve (default ${DEFAULT_TOP_K}).`),
  }),
} as const;

export const BINDABLE_TOOLS = [RETRIEVE_TOOL, MORTGAGE_RATE_TOOL];
