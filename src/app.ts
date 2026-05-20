import express from "express";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { pool as defaultPool } from "./db/client";
import { ingestProducts, ingestArticles, getAllProducts } from "./rag/ingest";
import { generateAnswer } from "./rag/generator";
import { retrieveProducts, retrieveDocuments } from "./rag/retriever";
import { createTenantAuth, AuthenticatedRequest } from "./middleware/auth";
import { adminAuth } from "./middleware/adminAuth";
import { createWidgetAuth } from "./middleware/widgetAuth";
import { env } from "./config/env";
import { ChatResponse, Tenant, WidgetSettings } from "./types";

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
  const widgetAuth = createWidgetAuth(pool);

  app.get("/", (_req, res) => {
    res.json({
      name: "ecommerce-rag-chatbot",
      ok: true,
      endpoints: [
        "GET /health",
        "POST /tenants",
        "GET /tenants",
        "DELETE /tenants/:id",
        "POST /admin/ingest/:tenantId",
        "POST /admin/ingest/articles/:tenantId",
        "POST /ingest",
        "POST /ingest/articles",
        "POST /chat",
        "POST /widget/chat",
        "GET /widget/products",
        "GET /widget/config",
        "GET /widget.js",
        "PATCH /tenants/:id/settings",
        "GET /demo-shop",
        "GET /chat-ui",
        "GET /admin-ui"
      ]
    });
  });

  const adminUiPath = path.resolve(process.cwd(), "public", "admin.html");

  app.get("/chat-ui", (_req, res) => {
    res.sendFile(chatUiPath);
  });

  app.get("/admin-ui", (_req, res) => {
    res.sendFile(adminUiPath);
  });

  app.get("/demo-shop", (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "public", "demo-shop.html"));
  });

  app.get("/widget.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.resolve(process.cwd(), "public", "widget.js"));
  });

  app.get("/admin-config", (_req, res) => {
    res.json({ supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey });
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

    const result = await pool.query<{ id: string; name: string; widget_key: string; widget_settings: Record<string, unknown>; created_at: string }>(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, widget_key, widget_settings, created_at`,
      [parsed.data.id, parsed.data.name]
    );

    const row = result.rows[0];
    const tenant: Tenant = { id: row.id, name: row.name, widgetKey: row.widget_key, widgetSettings: row.widget_settings ?? {}, createdAt: row.created_at };
    return res.status(201).json({ tenant });
  });

  app.get("/tenants", adminAuth, async (_req, res) => {
    const result = await pool.query<{ id: string; name: string; widget_key: string; widget_settings: Record<string, unknown>; created_at: string }>(
      `SELECT id, name, widget_key, widget_settings, created_at FROM tenants ORDER BY created_at`
    );
    const tenants: Tenant[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      widgetKey: row.widget_key,
      widgetSettings: row.widget_settings ?? {},
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

  const widgetSettingsSchema = z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    buttonColor:  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    headerColor:  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    title:        z.string().max(60).optional(),
    subtitle:     z.string().max(100).optional(),
    position:     z.enum(["bottom-right", "bottom-left"]).optional(),
  });

  app.patch("/tenants/:id/settings", adminAuth, async (req, res) => {
    const parsed = widgetSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid settings" });
    const result = await pool.query<{ widget_settings: WidgetSettings }>(
      `UPDATE tenants SET widget_settings = $1 WHERE id = $2 RETURNING widget_settings`,
      [JSON.stringify(parsed.data), req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Tenant not found" });
    return res.json({ settings: result.rows[0].widget_settings });
  });

  // ── Admin ingest (admin-only) ───────────────────────────────────────────────

  const adminIngestParamSchema = z.object({ tenantId: z.string().uuid() });

  app.post("/admin/ingest/articles/:tenantId", adminAuth, async (req, res) => {
    const parsed = adminIngestParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: "Invalid tenantId — must be a UUID" });
    const count = await ingestArticles(pool, parsed.data.tenantId);
    return res.json({ ok: true, count });
  });

  app.post("/admin/ingest/:tenantId", adminAuth, async (req, res) => {
    const parsed = adminIngestParamSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: "Invalid tenantId — must be a UUID" });
    const count = await ingestProducts(pool, parsed.data.tenantId);
    return res.json({ ok: true, count });
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

  // ── Widget chat (public widget key, CORS-enabled) ───────────────────────────

  const widgetCors = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Widget-Key");
    next();
  };

  app.options("/widget/chat", widgetCors, (_req, res) => { res.status(204).send(); });
  app.options("/widget/products", widgetCors, (_req, res) => { res.status(204).send(); });
  app.options("/widget/config", widgetCors, (_req, res) => { res.status(204).send(); });

  app.get("/widget/products", widgetCors, widgetAuth, async (req, res) => {
    const tenantId = (req as AuthenticatedRequest).tenantId;
    const products = await getAllProducts(pool, tenantId);
    return res.json({ products });
  });

  app.get("/widget/config", widgetCors, widgetAuth, async (req, res) => {
    const tenantId = (req as AuthenticatedRequest).tenantId;
    const result = await pool.query<{ widget_settings: WidgetSettings }>(
      `SELECT widget_settings FROM tenants WHERE id = $1`, [tenantId]
    );
    return res.json({ settings: result.rows[0]?.widget_settings ?? {} });
  });

  app.post("/widget/chat", widgetCors, widgetAuth, async (req, res) => {
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
      recommendedProducts: matches.map((m) => m.product),
      citations: matches.map((m) => ({ id: m.product.id, title: m.product.title, score: Number(m.score.toFixed(3)) })),
      appliedFilters: filters,
      knowledgeChunks: docChunks.map((d) => ({ id: d.chunk.id, title: d.chunk.title, score: Number(d.score.toFixed(3)) })),
    };
    return res.json(response);
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
