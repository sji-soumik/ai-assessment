import { getSql } from "./db";
import { embed, toVectorLiteral } from "./embeddings";
import { BAD_RETRIEVAL_SCORES, isBadRetrievalChaos } from "../chaos";

/** One hit from similarity search: a Chunk plus its source Document. */
export interface RetrievalHit {
  chunkId: number;
  documentId: number;
  sourcePath: string;
  score: number; // cosine similarity in [0, 1]; higher is closer
  content: string;
}

export const DEFAULT_TOP_K = 4;

function overlayBadRetrieval(hits: RetrievalHit[]): RetrievalHit[] {
  return BAD_RETRIEVAL_SCORES.map((score, i) => ({
    ...(hits[i] ?? {
      chunkId: -(i + 1),
      documentId: -(i + 1),
      sourcePath: "chaos/poor-match.md",
      score,
      content: "Unrelated fragment: this document does not answer the query.",
    }),
    score,
  }));
}

async function search(query: string, topK: number): Promise<RetrievalHit[]> {
  const sql = getSql();
  const queryVector = toVectorLiteral(embed(query));

  const rows = await sql`
    SELECT
      c.id           AS chunk_id,
      c.document_id  AS document_id,
      d.source_path  AS source_path,
      c.content      AS content,
      1 - (c.embedding <=> ${queryVector}::vector) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <=> ${queryVector}::vector
    LIMIT ${topK}
  `;

  return (rows as Record<string, unknown>[]).map((row) => ({
    chunkId: Number(row.chunk_id),
    documentId: Number(row.document_id),
    sourcePath: String(row.source_path),
    score: Number(row.score),
    content: String(row.content),
  }));
}

/**
 * Top-K cosine similarity search over chunk embeddings. Score is
 * `1 - cosine_distance`, so 1.0 is identical and ~0 is unrelated.
 * Phase 14 `bad_retrieval` overlays scores 0.31 / 0.28 / 0.24 (and canned
 * hits if the store is unreachable) so the demo is deterministic.
 */
export async function similaritySearch(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievalHit[]> {
  if (isBadRetrievalChaos()) {
    try {
      return overlayBadRetrieval(await search(query, topK));
    } catch {
      return overlayBadRetrieval([]);
    }
  }
  return search(query, topK);
}
