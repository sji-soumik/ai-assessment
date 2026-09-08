import { describe, expect, test } from "bun:test";
import { chunk } from "../src/rag/chunk";
import { embed, EMBEDDING_DIM, toVectorLiteral } from "../src/rag/embeddings";
import { DEFAULT_TOP_K, similaritySearch } from "../src/rag/search";
import { ingest } from "../src/rag/ingest";

describe("embeddings", () => {
  test("deterministic and EMBEDDING_DIM long", () => {
    const a = embed("What is the FHA credit overlay?");
    const b = embed("What is the FHA credit overlay?");
    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(a).toEqual(b);
  });

  test("non-empty text yields a unit vector", () => {
    const v = embed("conventional loan-to-value overlay");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  test("empty text yields a zero vector", () => {
    const v = embed("   ");
    expect(v.every((x) => x === 0)).toBe(true);
  });

  test("different text yields a different vector", () => {
    expect(embed("fha overlay")).not.toEqual(embed("va funding fee"));
  });

  test("toVectorLiteral formats a pgvector literal", () => {
    expect(toVectorLiteral([0.1, -0.2, 0.3])).toBe("[0.1,-0.2,0.3]");
  });
});

describe("chunking", () => {
  test("short text is a single chunk", () => {
    expect(chunk("a short policy note")).toEqual(["a short policy note"]);
  });

  test("long text splits into overlapping chunks", () => {
    const text = "x".repeat(1200);
    const chunks = chunk(text, { size: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // step = size - overlap = 400; ceil(1200/400) = 3 windows.
    expect(chunks.length).toBe(3);
  });

  test("rejects invalid overlap", () => {
    expect(() => chunk("abc", { size: 100, overlap: 100 })).toThrow();
  });

  test("empty text yields no chunks", () => {
    expect(chunk("   ")).toEqual([]);
  });
});

// Integration: requires a running pgvector (set DATABASE_URL). Auto-skipped otherwise.
describe("retrieval (auto-skipped without DATABASE_URL)", () => {
  test.skipIf(!process.env.DATABASE_URL)(
    "ingest is idempotent and similarity search returns top-K chunks with scores",
    async () => {
      const first = await ingest();
      expect(first.documents).toBeGreaterThan(0);
      expect(first.chunks).toBeGreaterThan(0);

      // Re-ingest must not duplicate documents (idempotent by source path).
      const second = await ingest();
      expect(second.documents).toBe(first.documents);
      expect(second.chunks).toBe(first.chunks);

      const hits = await similaritySearch("What is the FHA credit score overlay?");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThanOrEqual(DEFAULT_TOP_K);
      for (const hit of hits) {
        expect(hit.score).toBeGreaterThanOrEqual(0);
        expect(hit.score).toBeLessThanOrEqual(1);
        expect(hit.chunkId).toBeGreaterThan(0);
        expect(hit.documentId).toBeGreaterThan(0);
        expect(hit.content.length).toBeGreaterThan(0);
      }
      // Scores are sorted descending (closest first).
      const scores = hits.map((h) => h.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);

      // The FHA overlay question should surface the product overlays document.
      expect(hits.some((h) => h.sourcePath === "product-overlays.md")).toBe(true);
    },
    60_000,
  );
});
