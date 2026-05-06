import { Product, RetrievedProduct } from "../types";

export type RetrievalFilters = {
  maxPrice?: number;
  category?: string;
  inStockOnly: boolean;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "for",
  "to",
  "and",
  "or",
  "with",
  "i",
  "need",
  "want",
  "show",
  "me",
  "under"
]);

const CATEGORY_ALIASES: Record<string, string[]> = {
  shoes: ["shoes", "sneakers", "running"],
  apparel: ["apparel", "shirt", "tee", "clothing"],
  electronics: ["electronics", "headphones", "audio", "bluetooth"],
  home: ["home", "kitchen", "coffee"]
};

export const parseFilters = (message: string): RetrievalFilters => {
  const lower = message.toLowerCase();
  const maxPriceMatch = lower.match(/(?:under|below|less than)\s*\$?(\d+(?:\.\d+)?)/);
  const maxPrice = maxPriceMatch ? Number(maxPriceMatch[1]) : undefined;

  const category = Object.entries(CATEGORY_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => lower.includes(alias))
  )?.[0];

  return {
    maxPrice,
    category,
    inStockOnly: !lower.includes("out of stock")
  };
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const termCounts = (tokens: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

const cosineSimilarity = (a: Map<string, number>, b: Map<string, number>): number => {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (const value of a.values()) aNorm += value * value;
  for (const value of b.values()) bNorm += value * value;

  for (const [key, aValue] of a.entries()) {
    const bValue = b.get(key);
    if (bValue) dot += aValue * bValue;
  }

  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
};

export const retrieveProducts = (
  message: string,
  products: Product[],
  topK = 3
): { filters: RetrievalFilters; matches: RetrievedProduct[] } => {
  const filters = parseFilters(message);
  const queryVector = termCounts(tokenize(message));

  const filtered = products.filter((product) => {
    if (filters.inStockOnly && !product.inStock) return false;
    if (typeof filters.maxPrice === "number" && product.price > filters.maxPrice) return false;
    if (filters.category && product.category !== filters.category) return false;
    return true;
  });

  const matches = filtered
    .map((product) => {
      const text = `${product.title} ${product.description} ${product.brand} ${product.category}`;
      const score = cosineSimilarity(queryVector, termCounts(tokenize(text)));
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { filters, matches };
};

