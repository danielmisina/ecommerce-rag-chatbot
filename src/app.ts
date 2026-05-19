import express from "express";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { pool as defaultPool } from "./db/client";
import { ingestProducts, ingestArticles } from "./rag/ingest";
import { generateAnswer } from "./rag/generator";
import { retrieveProducts, retrieveDocuments } from "./rag/retriever";
import { createTenantAuth, AuthenticatedRequest } from "./middleware/auth";
import { adminAuth } from "./middleware/adminAuth";
import { ChatResponse, Tenant } from "./types";

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1)
});

const createTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1)
});

export const createApp = (pool: Pool = defaultPool) => {
  const app = express();
  app.use(express.json());
  const chatUiPath = path.resolve(process.cwd(), "public", "chat.html");
  const tenantAuth = createTenantAuth(pool);

  app.get("/", (_req, res) => {
    res.json({
      name: "ecommerce-rag-chatbot",
      ok: true,
      endpoints: [
        "GET /health",
        "POST /tenants",
        "GET /tenants",
        "DELETE /tenants/:id",
        "POST /ingest",
        "POST /ingest/articles",
        "POST /chat"
      ]
    });
  });

  app.get("/chat-ui", (_req, res) => {
    res.sendFile(chatUiPath);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // ── Tenant management (admin-only) ──────────────────────────────────────────

  app.post("/tenants", adminAuth, async (req, res) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const result = await pool.query<{ id: string; name: string; created_at: string }>(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, created_at`,
      [parsed.data.id, parsed.data.name]
    );

    const row = result.rows[0];
    const tenant: Tenant = { id: row.id, name: row.name, createdAt: row.created_at };
    return res.status(201).json({ tenant });
  });

  app.get("/tenants", adminAuth, async (_req, res) => {
    const result = await pool.query<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM tenants ORDER BY created_at`
    );
    const tenants: Tenant[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
    return res.json({ tenants });
  });

  app.delete("/tenants/:id", adminAuth, async (req, res) => {
    const { id } = req.params;
    await pool.query(`DELETE FROM products WHERE tenant_id = $1`, [id]);
    await pool.query(`DELETE FROM documents WHERE tenant_id = $1`, [id]);
    const result = await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    return res.json({ ok: true });
  });

  // ── Ingestion (tenant-authenticated) ────────────────────────────────────────

  app.post("/ingest", tenantAuth, async (req, res) => {
    const tenantId = (req as AuthenticatedRequest).tenantId;
    const count = await ingestProducts(pool, tenantId);
    res.json({ ok: true, count });
  });

  app.post("/ingest/articles", tenantAuth, async (req, res) => {
    const tenantId = (req as AuthenticatedRequest).tenantId;
    const count = await ingestArticles(pool, tenantId);
    res.json({ ok: true, count });
  });

  // ── Chat (tenant-authenticated) ─────────────────────────────────────────────

  app.post("/chat", tenantAuth, async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const tenantId = (req as AuthenticatedRequest).tenantId;

    const [{ filters, matches }, docChunks] = await Promise.all([
      retrieveProducts(parsed.data.message, pool, tenantId, 3),
      retrieveDocuments(parsed.data.message, pool, tenantId, 3),
    ]);

    const answer = await generateAnswer(parsed.data.message, matches, docChunks);

    const response: ChatResponse = {
      answer,
      recommendedProducts: matches.map((match) => match.product),
      citations: matches.map((match) => ({
        id: match.product.id,
        title: match.product.title,
        score: Number(match.score.toFixed(3))
      })),
      appliedFilters: filters,
      knowledgeChunks: docChunks.map((d) => ({
        id: d.chunk.id,
        title: d.chunk.title,
        score: Number(d.score.toFixed(3)),
      })),
    };

    return res.json(response);
  });

  return app;
};
