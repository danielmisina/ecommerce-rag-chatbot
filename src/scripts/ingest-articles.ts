import { pool } from "../db/client";
import { ingestArticles } from "../rag/ingest";

(async () => {
  console.log("Ingesting articles...");
  const count = await ingestArticles(pool);
  console.log(`Done — ${count} chunks stored.`);
  await pool.end();
})();

