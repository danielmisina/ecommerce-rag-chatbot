import { Pool } from "pg";
import productsJson from "../data/products.json";
import { Product } from "../types";
import { getEmbedding } from "./embedder";

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
});

export const ingestProducts = async (pool: Pool): Promise<number> => {
  const products = productsJson as Product[];

  for (const product of products) {
    const text = `${product.title} ${product.description} ${product.brand} ${product.category}`;
    const embedding = await getEmbedding(text);

    await pool.query(
      `INSERT INTO products (id, title, description, category, brand, price, currency, in_stock, rating, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         title       = EXCLUDED.title,
         description = EXCLUDED.description,
         category    = EXCLUDED.category,
         brand       = EXCLUDED.brand,
         price       = EXCLUDED.price,
         currency    = EXCLUDED.currency,
         in_stock    = EXCLUDED.in_stock,
         rating      = EXCLUDED.rating,
         embedding   = EXCLUDED.embedding`,
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
        embedding ? `[${embedding.join(",")}]` : null,
      ]
    );
  }

  return products.length;
};

export const getAllProducts = async (pool: Pool): Promise<Product[]> => {
  const result = await pool.query<ProductRow>(
    `SELECT id, title, description, category, brand, price, currency, in_stock, rating FROM products`
  );
  return result.rows.map(rowToProduct);
};
