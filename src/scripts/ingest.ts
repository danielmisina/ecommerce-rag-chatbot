import { pool } from "../db/client";
import { ingestProducts } from "../rag/ingest";
import { retrieveProducts } from "../rag/retriever";

(async () => {
  const count = await ingestProducts(pool);
  console.log(`Ingested ${count} products.`);

  const sampleQuery = "I need running shoes under $100";
  const { filters, matches } = await retrieveProducts(sampleQuery, pool, 3);

  console.log("Sample query:", sampleQuery);
  console.log("Applied filters:", filters);
  console.log(
    "Top matches:",
    matches.map((item) => ({ id: item.product.id, title: item.product.title, score: item.score.toFixed(3) }))
  );

  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
