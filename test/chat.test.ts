import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted above imports; vi.hoisted lets us share
// variables between the hoisted zone and the rest of the file.

const { mockPool } = vi.hoisted(() => {
  const mockRows = [
    { id: "tri-s001", title: "Orca Athlex Flex Wetsuit", description: "Full-sleeve open-water triathlon wetsuit with flexible neoprene panels.", category: "swim", brand: "Orca", price: "299.99", currency: "USD", in_stock: true, rating: "4.7" },
    { id: "tri-b002", title: "Giro Aerohead MIPS Helmet", description: "Aerodynamic TT cycling helmet with MIPS protection.", category: "bike", brand: "Giro", price: "249.99", currency: "USD", in_stock: true, rating: "4.7" },
    { id: "tri-r001", title: "ASICS Gel-Nimbus 26", description: "Premium long-distance running shoe with FF BLAST+ cushioning.", category: "run", brand: "ASICS", price: "164.99", currency: "USD", in_stock: true, rating: "4.7" }
  ];

  const mockPool = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("SELECT")) {
        return Promise.resolve({ rows: mockRows });
      }
      return Promise.resolve({ rows: [] });
    })
  };

  return { mockPool };
});

vi.mock("../src/db/client", () => ({ pool: mockPool }));
vi.mock("../src/rag/embedder", () => ({ getEmbedding: vi.fn().mockResolvedValue(null) }));
vi.mock("../src/rag/generator", () => ({ generateAnswer: vi.fn().mockResolvedValue("Here are some options based on your request.") }));

// ── Tests ──────────────────────────────────────────────────────────────────

import { createApp } from "../src/app";

describe("RAG API", () => {
  const app = createApp();

  it("returns API metadata at root", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
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

  it("returns product recommendations for a query", async () => {
    const res = await request(app).post("/chat").send({
      message: "show me running shoes under $200"
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendedProducts)).toBe(true);
    expect(res.body.recommendedProducts.length).toBeGreaterThan(0);
    expect(res.body.appliedFilters.maxPrice).toBe(200);
    expect(res.body.appliedFilters.category).toBe("run");
  });

  it("ingests products and returns count", async () => {
    const res = await request(app).post("/ingest");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(21);
  });
});

