/**
 * Document ingestion: read the policy corpus, chunk it, embed each chunk, and
 * store Documents + Chunks in pgvector. Idempotent — re-running replaces a
 * Document's chunks in place (keyed by source path).
 *
 * Run with: bun run ingest
 */
import { Glob } from "bun";
import { chunk } from "./chunk";
import { ensureSchema, getSql, isDatabaseConfigured } from "./db";
import { embed, toVectorLiteral } from "./embeddings";

const DOCS_DIR = `${import.meta.dir}/../../rag/docs`;

/** First markdown heading, else the file name — used as the Document title. */
function titleOf(sourcePath: string, text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.replace(/^#+\s*/, "");
  }
  return sourcePath;
}

export interface IngestResult {
  documents: number;
  chunks: number;
}

export async function ingest(): Promise<IngestResult> {
  const sql = getSql();
  await ensureSchema(sql);

  const glob = new Glob("*.md");
  let documents = 0;
  let chunks = 0;

  for await (const filePath of glob.scan({ cwd: DOCS_DIR, absolute: true })) {
    const sourcePath = filePath.slice(filePath.lastIndexOf("/") + 1);
    const text = await Bun.file(filePath).text();
    const title = titleOf(sourcePath, text);
    const pieces = chunk(text);

    // One transaction per document keeps ingest idempotent: drop the old
    // Document (cascade removes its Chunks) and re-insert.
    await sql.begin(async (tx) => {
      await tx`DELETE FROM documents WHERE source_path = ${sourcePath}`;
      const [doc] = await tx`
        INSERT INTO documents (source_path, title)
        VALUES (${sourcePath}, ${title})
        RETURNING id
      `;
      const documentId = Number(doc!.id);

      for (const content of pieces) {
        const embedding = toVectorLiteral(embed(content));
        await tx`
          INSERT INTO chunks (document_id, content, embedding)
          VALUES (${documentId}, ${content}, ${embedding}::vector)
        `;
      }
    });

    documents += 1;
    chunks += pieces.length;
    console.log(`[ingest] ${sourcePath}: ${pieces.length} chunks`);
  }

  return { documents, chunks };
}

// Run when invoked directly (bun run ingest).
if (import.meta.main) {
  if (!isDatabaseConfigured()) {
    console.error(
      "DATABASE_URL is not set. Start Postgres+pgvector (docker compose up -d in ops/) " +
        "and set DATABASE_URL in .env, then re-run `bun run ingest`.",
    );
    process.exit(1);
  }
  const result = await ingest();
  console.log(`[ingest] done: ${result.documents} documents, ${result.chunks} chunks`);
  await getSql().end();
}
