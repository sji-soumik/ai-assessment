/**
 * Local, deterministic embeddings — no external API keys (see AGENT.md).
 *
 * A hashing vectorizer over word unigrams/bigrams and intra-word character
 * 3-grams, projected into a fixed 512-dim space and L2-normalised. Deterministic
 * output means retrieval scores are reproducible, which the Phase 14
 * `bad_retrieval` demo relies on.
 *
 * SWAP POINT: to use a real embedding model (Voyage, OpenAI, etc.) replace
 * `embed` with an async call and keep `EMBEDDING_DIM` in sync with the store's
 * `vector(<dim>)` column.
 */
export const EMBEDDING_DIM = 512;

/** FNV-1a 32-bit hash — small, fast, deterministic. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Emit the features (n-grams) that represent a piece of text. */
function* features(text: string): Generator<string> {
  const words = tokenize(text);
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    yield `w:${word}`; // unigram
    if (i + 1 < words.length) yield `b:${word}_${words[i + 1]}`; // bigram

    const padded = `^${word}$`; // character 3-grams, with word boundaries
    for (let j = 0; j + 3 <= padded.length; j++) {
      yield `c:${padded.slice(j, j + 3)}`;
    }
  }
}

/** Embed text into a unit-length EMBEDDING_DIM vector. */
export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);

  for (const feature of features(text)) {
    const hash = fnv1a(feature);
    const bucket = hash % EMBEDDING_DIM;
    const sign = (hash & 0x80000000) !== 0 ? -1 : 1; // signed hashing curbs collision bias
    vector[bucket]! += sign;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector; // empty/degenerate text → zero vector

  for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
  return vector;
}

/** pgvector text literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
