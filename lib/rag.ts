import { extractText } from 'unpdf';

export interface PdfPageChunk {
  pageNumber: number;
  text: string;
}

export const VECTOR_EMBEDDING_DIMENSIONS = 1536;

/**
 * Extracts per-page plain text from a PDF buffer using `unpdf`,
 * preserving exact 1-based page numbers for grounded RAG citations.
 */
export async function extractPdfPagesText(
  bytes: Uint8Array
): Promise<PdfPageChunk[]> {
  const result = await extractText(new Uint8Array(bytes), {
    mergePages: false,
  });

  const rawPages = Array.isArray(result.text)
    ? result.text
    : [String(result.text ?? '')];

  const pages: PdfPageChunk[] = [];
  for (let i = 0; i < rawPages.length; i++) {
    const cleaned = String(rawPages[i] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 0) {
      pages.push({
        pageNumber: i + 1,
        text: cleaned,
      });
    }
  }
  return pages;
}

/**
 * Splits extracted PDF pages into ~800-character overlapping chunks (~120-char
 * overlap) while retaining the exact originating `pageNumber` on every chunk.
 */
export function chunkPdfPages(
  pages: PdfPageChunk[],
  chunkSize = 800,
  overlap = 120
): PdfPageChunk[] {
  const safeSize = Math.max(200, chunkSize);
  const safeOverlap = Math.min(Math.floor(safeSize / 2), Math.max(0, overlap));
  const chunks: PdfPageChunk[] = [];

  for (const page of pages) {
    const normalized = page.text.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    if (normalized.length <= safeSize) {
      chunks.push({
        pageNumber: page.pageNumber,
        text: normalized,
      });
      continue;
    }

    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(normalized.length, start + safeSize);
      if (end < normalized.length) {
        const lastSpace = normalized.lastIndexOf(' ', end);
        if (lastSpace > start + Math.floor(safeSize * 0.6)) {
          end = lastSpace;
        }
      }

      const slice = normalized.slice(start, end).trim();
      if (slice.length > 0) {
        chunks.push({
          pageNumber: page.pageNumber,
          text: slice,
        });
      }

      if (end >= normalized.length) break;
      const nextStart = end - safeOverlap;
      start = nextStart > start ? nextStart : end;
    }
  }

  return chunks;
}

/**
 * Deterministic 1536-dimensional L2-normalized sparse-projection embedding used
 * when live OpenRouter embeddings are unavailable or disabled in free dev mode.
 * Preserves semantic keyword/trigram overlap across Convex vector search.
 */
export function computeDeterministicEmbedding1536(text: string): number[] {
  const vec = new Float64Array(VECTOR_EMBEDDING_DIMENSIONS);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);

  if (tokens.length === 0) {
    vec[0] = 1;
    return Array.from(vec);
  }

  const hashIndex = (str: string, seed: number): number => {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    }
    return h % VECTOR_EMBEDDING_DIMENSIONS;
  };

  for (const token of tokens) {
    const idx1 = hashIndex(token, 2166136261);
    const idx2 = hashIndex(`bi:${token}`, 3865031791);
    vec[idx1] += 2.0;
    vec[idx2] += 1.0;

    for (let i = 0; i <= token.length - 3; i++) {
      const trigram = token.slice(i, i + 3);
      const triIdx = hashIndex(trigram, 975312468);
      vec[triIdx] += 0.65;
    }
  }

  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  const out = new Array<number>(VECTOR_EMBEDDING_DIMENSIONS);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / norm;
  }
  return out;
}
