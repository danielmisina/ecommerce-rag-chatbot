import { pool } from "../db/client";
import { ingestArticles } from "../rag/ingest";

const tenantId = process.env.SEED_TENANT_ID;
if (!tenantId) {
  console.error("Error: SEED_TENANT_ID env var is required. Create a tenant first via POST /tenants.");
  process.exit(1);
}

(async () => {
  console.log(`Ingesting articles for tenant ${tenantId}...`);
  const count = await ingestArticles(pool, tenantId);
  console.log(`Done — ${count} chunks stored.`);
  await pool.end();
})();

