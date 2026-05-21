import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import productsJson from "../data/products.json";
import { Product } from "../types";
import { getEmbedding } from "./embedder";
import { chunkMarkdown } from "./chunker";
import { env } from "../config/env";

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
});

export const ingestProducts = async (pool: Pool, tenantId: string): Promise<number> => {
  const { rows } = await pool.query<{ widget_key: string; tenant_product_data: Product[] | null }>(
    `SELECT widget_key, tenant_product_data FROM tenants WHERE id = $1`, [tenantId]
  );
  const widgetKey = rows[0]?.widget_key ?? "";
  const products: Product[] = rows[0]?.tenant_product_data ?? (productsJson as Product[]);

  for (const product of products) {
    const id = `${tenantId}-${product.id}`;
    const url = widgetKey
      ? `${env.siteUrl}/demo-shop?key=${widgetKey}&product=${encodeURIComponent(id)}`
      : null;
    const text = `${product.title} ${product.description} ${product.brand} ${product.category}`;
    const embedding = await getEmbedding(text);

    await pool.query(
      `INSERT INTO products (id, tenant_id, title, description, category, brand, price, currency, in_stock, rating, url, embedding)
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
         embedding         = EXCLUDED.embedding`,
      [
        id,
        tenantId,
        product.title,
        product.description,
        product.category,
        product.brand,
        product.price,
        product.currency,
        product.inStock,
        product.rating,
        url,
        embedding ? `[${embedding.join(",")}]` : null,
      ]
    );
  }

  return products.length;
};

export const getAllProducts = async (pool: Pool, tenantId: string): Promise<Product[]> => {
  const result = await pool.query<ProductRow>(
    `SELECT id, title, description, category, brand, price, currency, in_stock, rating, url FROM products WHERE tenant_id = $1`,
    [tenantId]
  );
  return result.rows.map(rowToProduct);
};

export const ingestArticles = async (pool: Pool, tenantId: string): Promise<number> => {
  const { rows: tenantRows } = await pool.query<{ enabled_articles: string[] | null }>(
    `SELECT enabled_articles FROM tenants WHERE id = $1`, [tenantId]
  );
  const enabled = tenantRows[0]?.enabled_articles ?? null; // null = all articles

  const files = fs.readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => enabled === null || enabled.includes(f.replace(".md", "")));
  let totalChunks = 0;

  for (const file of files) {
    const sourceId = file.replace(".md", "");
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");

    const titleMatch = raw.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : sourceId;
    const tags = sourceId.split("-").filter((t) => t.length > 2);
    const chunks = chunkMarkdown(raw);

    for (const chunk of chunks) {
      const id = `${tenantId}-${sourceId}-${chunk.index}`;
      const embedding = await getEmbedding(chunk.body);

      await pool.query(
        `INSERT INTO documents (id, tenant_id, source_id, title, chunk_index, body, tags, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title       = EXCLUDED.title,
           chunk_index = EXCLUDED.chunk_index,
           body        = EXCLUDED.body,
           tags        = EXCLUDED.tags,
           embedding   = EXCLUDED.embedding`,
        [
          id,
          tenantId,
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
