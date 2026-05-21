import fs from "node:fs";
import path from "node:path";
import { pool } from "./client";

const ARTICLES_DIR = path.resolve(__dirname, "../data/articles");

async function seed() {
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const id = file.replace(".md", "");
    const content = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : id;
    await pool.query(
      `INSERT INTO articles (id, title, content) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, title, content]
    );
    console.log(`Seeded: ${id}`);
  }
  await pool.end();
}

seed().catch(console.error);
