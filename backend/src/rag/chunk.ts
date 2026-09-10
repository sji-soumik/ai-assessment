/**
 * Character-window chunking with overlap. Documents are small policy markdown
 * files, so a simple sliding window keeps related sentences together while the
 * overlap avoids splitting a rule across a boundary.
 */
export interface ChunkOptions {
  /** Target chunk size in characters. */
  size?: number;
  /** Characters shared between consecutive chunks. */
  overlap?: number;
}

const DEFAULTS = { size: 500, overlap: 100 } as const;

export function chunk(text: string, options: ChunkOptions = {}): string[] {
  const size = options.size ?? DEFAULTS.size;
  const overlap = options.overlap ?? DEFAULTS.overlap;
  if (size <= 0) throw new Error("chunk size must be positive");
  if (overlap < 0 || overlap >= size) throw new Error("overlap must be in [0, size)");

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= size) return [normalized];

  const step = size - overlap;
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += step) {
    const piece = normalized.slice(start, start + size).trim();
    if (piece.length > 0) chunks.push(piece);
    if (start + size >= normalized.length) break;
  }
  return chunks;
}
