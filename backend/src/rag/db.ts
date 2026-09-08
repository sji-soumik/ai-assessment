import { SQL } from "bun";
import { EMBEDDING_DIM } from "./embeddings";

/**
 * pgvector access via Bun's native SQL client (never the `pg` package — see
 * CLAUDE.md). One lazily-created connection is shared across the process.
 */
let client: SQL | undefined;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Start Postgres+pgvector (docker compose up -d) " +
        "and set DATABASE_URL, then run `bun run ingest`.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Shared SQL client. Throws DatabaseNotConfiguredError when DATABASE_URL is unset. */
export function getSql(): SQL {
  if (!process.env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  return (client ??= new SQL(process.env.DATABASE_URL));
}

/**
 * Create the extension and tables if absent. Idempotent — safe to call on every
 * ingest.
 *
 * documents: one row per source markdown file (the Document).
 * chunks:    one row per embedded slice (the Chunk), pointing back to its Document.
 */
export async function ensureSchema(sql: SQL = getSql()): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source_path TEXT UNIQUE NOT NULL,
      title       TEXT NOT NULL
    )
  `;
  // EMBEDDING_DIM is a trusted numeric constant; interpolate it into the type
  // declaration (a column type can't be a bound parameter).
  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS chunks (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      embedding   VECTOR(${EMBEDDING_DIM}) NOT NULL
    )`,
  );
}
