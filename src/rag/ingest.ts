import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import productsJson from "../data/products.json";
import { Product } from "../types";
import { getEmbedding } from "./embedder";
import { chunkMarkdown } from "./chunker";

const ARTICLES_DIR = path.resolve(__dirname, "../data/articles");

type ProductRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  price: string;
  currency: string;
  in_stock: boolean;
  rating: string;
  url: string | null;
  carbs_per_serving: number | null;
};

const rowToProduct = (row: ProductRow): Product => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  brand: row.brand,
  price: Number(row.price),
  currency: row.currency,
  inStock: row.in_stock,
  rating: Number(row.rating),
  url: row.url ?? undefined,
  carbsPerServing: row.carbs_per_serving ?? undefined,
});

export const ingestProducts = async (pool: Pool): Promise<number> => {
  const products = productsJson as Product[];

  for (const product of products) {
    const text = `${product.title} ${product.description} ${product.brand} ${product.category}`;
    const embedding = await getEmbedding(text);

    await pool.query(
      `INSERT INTO products (id, title, description, category, brand, price, currency, in_stock, rating, url, carbs_per_serving, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         title             = EXCLUDED.title,
         description       = EXCLUDED.description,
         category          = EXCLUDED.category,
         brand             = EXCLUDED.brand,
         price             = EXCLUDED.price,
         currency          = EXCLUDED.currency,
         in_stock          = EXCLUDED.in_stock,
         rating            = EXCLUDED.rating,
         url               = EXCLUDED.url,
         carbs_per_serving = EXCLUDED.carbs_per_serving,
         embedding         = EXCLUDED.embedding`,
      [
        product.id,
        product.title,
        product.description,
        product.category,
        product.brand,
        product.price,
        product.currency,
        product.inStock,
        product.rating,
        product.url ?? null,
        product.carbsPerServing ?? null,
        embedding ? `[${embedding.join(",")}]` : null,
      ]
    );
  }

  return products.length;
};

export const getAllProducts = async (pool: Pool): Promise<Product[]> => {
  const result = await pool.query<ProductRow>(
    `SELECT id, title, description, category, brand, price, currency, in_stock, rating, url, carbs_per_serving FROM products`
  );
  return result.rows.map(rowToProduct);
};

export const ingestArticles = async (pool: Pool): Promise<number> => {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"));
  let totalChunks = 0;

  for (const file of files) {
    const sourceId = file.replace(".md", "");
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");

    const titleMatch = raw.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : sourceId;
    const tags = sourceId.split("-").filter((t) => t.length > 2);
    const chunks = chunkMarkdown(raw);

    for (const chunk of chunks) {
      const id = `${sourceId}-${chunk.index}`;
      const embedding = await getEmbedding(chunk.body);

      await pool.query(
        `INSERT INTO documents (id, source_id, title, chunk_index, body, tags, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           title       = EXCLUDED.title,
           chunk_index = EXCLUDED.chunk_index,
           body        = EXCLUDED.body,
           tags        = EXCLUDED.tags,
           embedding   = EXCLUDED.embedding`,
        [
          id,
          sourceId,
          title,
          chunk.index,
          chunk.body,
          tags,
          embedding ? `[${embedding.join(",")}]` : null,
        ]
      );
      totalChunks++;
    }
  }

  return totalChunks;
};
