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
import { Article, ChatResponse, Tenant, WidgetSettings } from "./types";

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
        "PATCH /tenants/:id/settings",
        "PUT /tenants/:id/products",
        "DELETE /tenants/:id/products",
        "PATCH /tenants/:id/articles",
        "GET /admin/articles",
        "POST /admin/articles",
        "GET /admin/articles/:id",
        "PUT /admin/articles/:id",
        "DELETE /admin/articles/:id",
        "POST /admin/ingest/:tenantId",
        "POST /admin/ingest/articles/:tenantId",
        "POST /ingest",
        "POST /ingest/articles",
        "POST /chat",
        "POST /widget/chat",
        "GET /widget/products",
        "GET /widget/config",
        "GET /widget.js",
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

  type TenantRow = {
    id: string; name: string; widget_key: string;
    widget_settings: Record<string, unknown>;
    tenant_product_data: unknown[] | null;
    enabled_articles: string[] | null;
    created_at: string;
  };
  const rowToTenant = (row: TenantRow): Tenant => ({
    id: row.id, name: row.name, widgetKey: row.widget_key,
    widgetSettings: row.widget_settings ?? {},
    tenantProductData: row.tenant_product_data ?? null,
    enabledArticles: row.enabled_articles ?? null,
    createdAt: row.created_at,
  });

  app.post("/tenants", adminAuth, async (req, res) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });
    const result = await pool.query<TenantRow>(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, widget_key, widget_settings, tenant_product_data, enabled_articles, created_at`,
      [parsed.data.id, parsed.data.name]
    );
    return res.status(201).json({ tenant: rowToTenant(result.rows[0]) });
  });

  app.get("/tenants", adminAuth, async (_req, res) => {
    const result = await pool.query<TenantRow>(
      `SELECT id, name, widget_key, widget_settings, tenant_product_data, enabled_articles, created_at
       FROM tenants ORDER BY created_at`
    );
    return res.json({ tenants: result.rows.map(rowToTenant) });
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

  // ── Per-tenant content management (admin-only) ─────────────────────────────

  const productItemSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    category: z.string().min(1),
    brand: z.string().min(1),
    price: z.number().nonnegative(),
    currency: z.string().default("USD"),
    inStock: z.boolean(),
    rating: z.number().min(0).max(5),
    url: z.string().optional(),
  });

  app.put("/tenants/:id/products", adminAuth, async (req, res) => {
    const parsed = z.array(productItemSchema).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid product array" });
    const r = await pool.query(
      `UPDATE tenants SET tenant_product_data = $1 WHERE id = $2 RETURNING id`,
      [JSON.stringify(parsed.data), req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Tenant not found" });
    return res.json({ ok: true });
  });

  app.delete("/tenants/:id/products", adminAuth, async (req, res) => {
    const r = await pool.query(
      `UPDATE tenants SET tenant_product_data = NULL WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Tenant not found" });
    return res.json({ ok: true });
  });

  app.patch("/tenants/:id/articles", adminAuth, async (req, res) => {
    const parsed = z.object({ enabled: z.array(z.string()).nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const r = await pool.query(
      `UPDATE tenants SET enabled_articles = $1 WHERE id = $2 RETURNING id`,
      [parsed.data.enabled, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Tenant not found" });
    return res.json({ ok: true });
  });

  const articleSchema = z.object({
    id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase letters, digits, hyphens"),
    title: z.string().min(1),
    content: z.string().min(1),
  });

  type ArticleRow = { id: string; title: string; content: string; created_at: string };
  const rowToArticle = (r: ArticleRow): Article => ({
    id: r.id, title: r.title, content: r.content, createdAt: r.created_at,
  });

  app.get("/admin/articles", adminAuth, async (_req, res) => {
    const result = await pool.query<ArticleRow>(
      `SELECT id, title, created_at FROM articles ORDER BY created_at`
    );
    return res.json({ articles: result.rows.map(r => ({ id: r.id, title: r.title, createdAt: r.created_at })) });
  });

  app.get("/admin/articles/:id", adminAuth, async (req, res) => {
    const result = await pool.query<ArticleRow>(
      `SELECT id, title, content, created_at FROM articles WHERE id = $1`, [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ article: rowToArticle(result.rows[0]) });
  });

  app.post("/admin/articles", adminAuth, async (req, res) => {
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid article" });
    const { id, title, content } = parsed.data;
    try {
      const r = await pool.query<ArticleRow>(
        `INSERT INTO articles (id, title, content) VALUES ($1, $2, $3) RETURNING id, title, created_at`,
        [id, title, content]
      );
      return res.status(201).json({ article: { id: r.rows[0].id, title: r.rows[0].title, createdAt: r.rows[0].created_at } });
    } catch (e: any) {
      if (e.code === "23505") return res.status(409).json({ error: "ID already exists" });
      throw e;
    }
  });

  app.put("/admin/articles/:id", adminAuth, async (req, res) => {
    const parsed = z.object({ title: z.string().min(1), content: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid article" });
    const r = await pool.query(
      `UPDATE articles SET title = $1, content = $2 WHERE id = $3 RETURNING id`,
      [parsed.data.title, parsed.data.content, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  });

  app.delete("/admin/articles/:id", adminAuth, async (req, res) => {
    const r = await pool.query(`DELETE FROM articles WHERE id = $1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
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
