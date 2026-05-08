const CHUNK_WORDS = 250;
const OVERLAP_WORDS = 25;

export type Chunk = {
  index: number;
  body: string;
};

/** Strips Markdown syntax and splits into overlapping word-window chunks. */
export const chunkMarkdown = (text: string): Chunk[] => {
  const plain = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|\*|_|`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const words = plain.split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_WORDS, words.length);
    const body = words.slice(start, end).join(" ");
    if (body.trim()) {
      chunks.push({ index: chunks.length, body: body.trim() });
    }
    if (end >= words.length) break;
    start = end - OVERLAP_WORDS;
  }

  return chunks;
};

