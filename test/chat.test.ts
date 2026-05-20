import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const MOCK_TENANT_UUID = "550e8400-e29b-41d4-a716-446655440000";
const MOCK_WIDGET_KEY = "wk_test-widget-key-1234";

const { mockPool, TEST_TENANT_ID } = vi.hoisted(() => {
  const TEST_TENANT_ID = "test-tenant-id";
  const mockRows = [
    { id: "test-tenant-id-tri-s001", title: "Orca Athlex Flex Wetsuit", description: "Full-sleeve open-water triathlon wetsuit.", category: "swim", brand: "Orca", price: "299.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
    { id: "test-tenant-id-tri-b002", title: "Giro Aerohead MIPS Helmet", description: "Aerodynamic TT cycling helmet.", category: "bike", brand: "Giro", price: "249.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
    { id: "test-tenant-id-tri-r001", title: "ASICS Gel-Nimbus 26", description: "Premium long-distance running shoe.", category: "run", brand: "ASICS", price: "164.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
  ];

  const mockTenantRow = { id: "550e8400-e29b-41d4-a716-446655440000", name: "acme", widget_key: "wk_test-widget-key-1234", created_at: new Date().toISOString() };

  const mockPool = {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      const upper = typeof sql === "string" ? sql.trim().toUpperCase() : "";
      if (upper.includes("INTO TENANTS")) {
        return Promise.resolve({ rows: [mockTenantRow] });
      }
      if (upper.startsWith("SELECT") && upper.includes("WHERE WIDGET_KEY")) {
        const key = params?.[0];
        return Promise.resolve({ rows: key === "wk_test-widget-key-1234" ? [{ id: mockTenantRow.id }] : [] });
      }
      if (upper.startsWith("SELECT") && upper.includes("FROM TENANTS")) {
        return Promise.resolve({ rows: [mockTenantRow] });
      }
      if (upper.startsWith("DELETE")) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (upper.startsWith("SELECT") && upper.includes("DOCUMENTS")) {
        return Promise.resolve({ rows: [] });
      }
      if (upper.startsWith("SELECT")) {
        return Promise.resolve({ rows: mockRows });
      }
      return Promise.resolve({ rows: [] });
    })
  };

  return { mockPool, TEST_TENANT_ID };
});

// Token sentinels — the verifyToken mock uses these to decide what to return
const TENANT_TOKEN = "mock-tenant-token";
const ADMIN_TOKEN = "mock-admin-token";
const INVALID_TOKEN = "mock-invalid-token";

vi.mock("../src/lib/verifyToken", () => ({
  verifyToken: vi.fn().mockImplementation((token: string) => {
    if (token === TENANT_TOKEN) {
      return Promise.resolve({ sub: TEST_TENANT_ID, email: "test@example.com" });
    }
    if (token === ADMIN_TOKEN) {
      return Promise.resolve({ sub: "admin-user-id", email: "admin@example.com", app_metadata: { role: "admin" } });
    }
    return Promise.reject(new Error("Invalid token"));
  })
}));

vi.mock("../src/db/client", () => ({ pool: mockPool }));
vi.mock("../src/rag/embedder", () => ({ getEmbedding: vi.fn().mockResolvedValue(null) }));
vi.mock("../src/rag/generator", () => ({ generateAnswer: vi.fn().mockResolvedValue("Here are some options based on your request.") }));
vi.mock("../src/config/env", () => ({
  env: {
    port: 3000,
    openAiApiKey: "",
    openAiModel: "gpt-4o-mini",
    openAiEmbeddingModel: "text-embedding-3-small",
    databaseUrl: "postgres://test",
    supabaseUrl: "https://test.supabase.co",
    supabaseAnonKey: "test-anon-key",
  }
}));

// ── Tests ──────────────────────────────────────────────────────────────────

import { createApp } from "../src/app";

describe("RAG API", () => {
  const app = createApp();

  it("returns API metadata at root", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.endpoints).toContain("POST /ingest/articles");
    expect(res.body.endpoints).toContain("POST /tenants");
  });

  it("serves browser chat UI", async () => {
    const res = await request(app).get("/chat-ui");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Ecommerce RAG Chat");
  });

  it("returns health status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── Auth guard tests ────────────────────────────────────────────────────────

  it("rejects /chat without a token", async () => {
    const res = await request(app).post("/chat").send({ message: "show me wetsuits" });
    expect(res.status).toBe(401);
  });

  it("rejects /ingest without a token", async () => {
    const res = await request(app).post("/ingest");
    expect(res.status).toBe(401);
  });

  it("rejects POST /tenants with non-admin token", async () => {
    const res = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${TENANT_TOKEN}`)
      .send({ name: "acme" });
    expect(res.status).toBe(403);
  });

  it("rejects GET /tenants without token", async () => {
    const res = await request(app).get("/tenants");
    expect(res.status).toBe(401);
  });

  // ── Tenant management ───────────────────────────────────────────────────────

  it("pre-provisions a tenant", async () => {
    const res = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ id: MOCK_TENANT_UUID, name: "acme" });
    expect(res.status).toBe(201);
    expect(res.body.tenant).toMatchObject({ id: MOCK_TENANT_UUID, name: "acme" });
  });

  it("lists tenants", async () => {
    const res = await request(app)
      .get("/tenants")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tenants)).toBe(true);
  });

  it("deletes a tenant", async () => {
    const res = await request(app)
      .delete(`/tenants/${MOCK_TENANT_UUID}`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── Authenticated endpoints ─────────────────────────────────────────────────

  it("returns product recommendations for a query", async () => {
    const res = await request(app)
      .post("/chat")
      .set("Authorization", `Bearer ${TENANT_TOKEN}`)
      .send({ message: "show me running shoes under $200" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendedProducts)).toBe(true);
    expect(res.body.recommendedProducts.length).toBeGreaterThan(0);
    expect(res.body.appliedFilters.maxPrice).toBe(200);
    expect(res.body.appliedFilters.category).toBe("run");
    expect(Array.isArray(res.body.knowledgeChunks)).toBe(true);
  });

  it("ingests products and returns count", async () => {
    const res = await request(app)
      .post("/ingest")
      .set("Authorization", `Bearer ${TENANT_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(27);
  });

  it("ingests articles and returns chunk count", async () => {
    const res = await request(app)
      .post("/ingest/articles")
      .set("Authorization", `Bearer ${TENANT_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.count).toBeGreaterThan(0);
  });

  // ── Admin ingest routes ─────────────────────────────────────────────────────

  describe("Admin ingest routes", () => {
    it("serves admin UI", async () => {
      const res = await request(app).get("/admin-ui");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Admin Dashboard");
    });

    it("rejects product ingest with invalid token", async () => {
      const res = await request(app)
        .post(`/admin/ingest/${MOCK_TENANT_UUID}`)
        .set("Authorization", `Bearer ${INVALID_TOKEN}`);
      expect(res.status).toBe(401);
    });

    it("rejects product ingest with non-admin token", async () => {
      const res = await request(app)
        .post(`/admin/ingest/${MOCK_TENANT_UUID}`)
        .set("Authorization", `Bearer ${TENANT_TOKEN}`);
      expect(res.status).toBe(403);
    });

    it("rejects article ingest with invalid token", async () => {
      const res = await request(app)
        .post(`/admin/ingest/articles/${MOCK_TENANT_UUID}`)
        .set("Authorization", `Bearer ${INVALID_TOKEN}`);
      expect(res.status).toBe(401);
    });

    it("rejects invalid tenantId (not a UUID)", async () => {
      const res = await request(app)
        .post("/admin/ingest/not-a-uuid")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("UUID");
    });

    it("admin ingests products for a specific tenant", async () => {
      const res = await request(app)
        .post(`/admin/ingest/${MOCK_TENANT_UUID}`)
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.count).toBe(27);
    });

    it("admin ingests articles for a specific tenant", async () => {
      const res = await request(app)
        .post(`/admin/ingest/articles/${MOCK_TENANT_UUID}`)
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.count).toBeGreaterThan(0);
    });
  });

  // ── Widget chat ─────────────────────────────────────────────────────────────

  describe("Widget chat", () => {
    it("serves widget.js", async () => {
      const res = await request(app).get("/widget.js");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/javascript");
    });

    it("rejects /widget/chat without widget key", async () => {
      const res = await request(app).post("/widget/chat").send({ message: "hello" });
      expect(res.status).toBe(401);
    });

    it("rejects /widget/chat with invalid widget key", async () => {
      const res = await request(app)
        .post("/widget/chat")
        .set("X-Widget-Key", "wk_invalid")
        .send({ message: "hello" });
      expect(res.status).toBe(401);
    });

    it("returns chat response with valid widget key", async () => {
      const res = await request(app)
        .post("/widget/chat")
        .set("X-Widget-Key", MOCK_WIDGET_KEY)
        .send({ message: "show me wetsuits" });
      expect(res.status).toBe(200);
      expect(res.body.answer).toBeTruthy();
      expect(Array.isArray(res.body.recommendedProducts)).toBe(true);
    });
  });
});
