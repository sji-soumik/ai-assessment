import { OpenAIEmbeddings } from "@langchain/openai";

/** Must match the pgvector `vector(<dim>)` column in db.ts. */
export const EMBEDDING_DIM = 512;
export const EMBEDDING_MODEL = "text-embedding-3-small";

let embeddings: OpenAIEmbeddings | undefined;

/** Single construction point for the embedding model. */
function getEmbeddings(): OpenAIEmbeddings {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key (Bun loads .env automatically).",
    );
  }
  return (embeddings ??= new OpenAIEmbeddings({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIM,
  }));
}

/** Embed text via OpenAI and return a fixed-size vector for pgvector storage/search. */
export async function embed(text: string): Promise<number[]> {
  return getEmbeddings().embedQuery(text);
}

/** pgvector text literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
