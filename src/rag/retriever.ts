import { Pool } from "pg";
import { Product, RetrievedProduct } from "../types";
import { getEmbedding } from "./embedder";
import { getAllProducts } from "./ingest";

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
  swim: ["swim", "wetsuit", "goggles", "trisuit", "tri suit", "open water", "pool"],
  bike: ["bike", "cycling", "bicycle", "triathlon bike", "tt bike", "helmet", "trainer", "zwift", "turbo"],
  run: ["run", "running", "shoes", "trail", "marathon", "brick", "jog"],
  nutrition: ["nutrition", "gel", "energy", "carbs", "electrolyte", "hydration", "recovery", "fuel", "drink mix"],
  gear: ["gear", "watch", "gps", "heart rate", "hrm", "bag", "backpack", "sunglasses", "race belt", "transition"]
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

const keywordFallback = async (
  message: string,
  filters: RetrievalFilters,
  pool: Pool,
  topK: number
): Promise<RetrievedProduct[]> => {
  const products = await getAllProducts(pool);
  const queryVector = termCounts(tokenize(message));

  const filtered = products.filter((product: Product) => {
    if (filters.inStockOnly && !product.inStock) return false;
    if (typeof filters.maxPrice === "number" && product.price > filters.maxPrice) return false;
    if (filters.category && product.category !== filters.category) return false;
    return true;
  });

  return filtered
    .map((product: Product) => {
      const text = `${product.title} ${product.description} ${product.brand} ${product.category}`;
      const score = cosineSimilarity(queryVector, termCounts(tokenize(text)));
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
};

export const retrieveProducts = async (
  message: string,
  pool: Pool,
  topK = 3
): Promise<{ filters: RetrievalFilters; matches: RetrievedProduct[] }> => {
  const filters = parseFilters(message);
  const embedding = await getEmbedding(message);

  if (embedding) {
    const conditions: string[] = [];
    const params: unknown[] = [`[${embedding.join(",")}]`];
    let idx = 2;

    if (filters.inStockOnly) conditions.push("in_stock = true");
    if (typeof filters.maxPrice === "number") {
      conditions.push(`price <= $${idx++}`);
      params.push(filters.maxPrice);
    }
    if (filters.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }
    conditions.push("embedding IS NOT NULL");
    params.push(topK);

    const where = conditions.join(" AND ");
    const sql = `
      SELECT id, title, description, category, brand, price, currency, in_stock, rating,
             1 - (embedding <=> $1) AS score
      FROM products
      WHERE ${where}
      ORDER BY embedding <=> $1
      LIMIT $${idx}
    `;

    const result = await pool.query(sql, params);

    const matches: RetrievedProduct[] = result.rows.map((row) => ({
      product: {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        category: row.category as string,
        brand: row.brand as string,
        price: Number(row.price),
        currency: row.currency as string,
        inStock: row.in_stock as boolean,
        rating: Number(row.rating)
      },
      score: Number(row.score)
    }));

    return { filters, matches };
  }

  // No embedding available — keyword fallback
  const matches = await keywordFallback(message, filters, pool, topK);
  return { filters, matches };
};
