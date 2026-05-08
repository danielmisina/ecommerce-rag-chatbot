import { readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "./client";

const sql = readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");

(async () => {
  console.log("Running migration...");
  await pool.query(sql);
  console.log("Migration complete.");
  await pool.end();
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

