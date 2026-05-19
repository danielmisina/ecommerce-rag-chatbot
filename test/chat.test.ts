import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockPool, TEST_JWT_SECRET, TEST_ADMIN_KEY, TEST_TENANT_ID } = vi.hoisted(() => {
  const TEST_JWT_SECRET = "test-jwt-secret";
  const TEST_ADMIN_KEY = "test-admin-key";
  const TEST_TENANT_ID = "test-tenant-id";
  const mockRows = [
    { id: "test-tenant-id-tri-s001", title: "Orca Athlex Flex Wetsuit", description: "Full-sleeve open-water triathlon wetsuit.", category: "swim", brand: "Orca", price: "299.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
    { id: "test-tenant-id-tri-b002", title: "Giro Aerohead MIPS Helmet", description: "Aerodynamic TT cycling helmet.", category: "bike", brand: "Giro", price: "249.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
    { id: "test-tenant-id-tri-r001", title: "ASICS Gel-Nimbus 26", description: "Premium long-distance running shoe.", category: "run", brand: "ASICS", price: "164.99", currency: "USD", in_stock: true, rating: "4.7", url: null },
  ];

  const mockTenantRow = { id: "new-tenant-id", name: "acme", created_at: new Date().toISOString() };

  const mockPool = {
    query: vi.fn().mockImplementation((sql: string) => {
      const upper = typeof sql === "string" ? sql.trim().toUpperCase() : "";
      if (upper.startsWith("INSERT INTO TENANTS")) {
        return Promise.resolve({ rows: [mockTenantRow] });
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

  return { mockPool, TEST_JWT_SECRET, TEST_ADMIN_KEY, TEST_TENANT_ID };
});

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
    jwtSecret: TEST_JWT_SECRET,
    adminApiKey: TEST_ADMIN_KEY,
  }
}));

// ── Tests ──────────────────────────────────────────────────────────────────

import { createApp } from "../src/app";

describe("RAG API", () => {
  const app = createApp();
  const tenantToken = jwt.sign({ tenantId: TEST_TENANT_ID }, TEST_JWT_SECRET);

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

  it("rejects POST /tenants without admin key", async () => {
    const res = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer wrong-key`)
      .send({ name: "acme" });
    expect(res.status).toBe(401);
  });

  it("rejects GET /tenants without admin key", async () => {
    const res = await request(app).get("/tenants");
    expect(res.status).toBe(401);
  });

  // ── Tenant management ───────────────────────────────────────────────────────

  it("creates a tenant and returns a JWT", async () => {
    const res = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${TEST_ADMIN_KEY}`)
      .send({ name: "acme" });
    expect(res.status).toBe(201);
    expect(res.body.tenant).toMatchObject({ id: "new-tenant-id", name: "acme" });
    expect(typeof res.body.token).toBe("string");
    const payload = jwt.verify(res.body.token, TEST_JWT_SECRET) as { tenantId: string };
    expect(payload.tenantId).toBe("new-tenant-id");
  });

  it("lists tenants", async () => {
    const res = await request(app)
      .get("/tenants")
      .set("Authorization", `Bearer ${TEST_ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tenants)).toBe(true);
  });

  it("deletes a tenant", async () => {
    const res = await request(app)
      .delete("/tenants/new-tenant-id")
      .set("Authorization", `Bearer ${TEST_ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── Authenticated endpoints ─────────────────────────────────────────────────

  it("returns product recommendations for a query", async () => {
    const res = await request(app)
      .post("/chat")
      .set("Authorization", `Bearer ${tenantToken}`)
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
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(27);
  });

  it("ingests articles and returns chunk count", async () => {
    const res = await request(app)
      .post("/ingest/articles")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.count).toBeGreaterThan(0);
  });
});
