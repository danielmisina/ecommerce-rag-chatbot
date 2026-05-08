import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted above imports; vi.hoisted lets us share
// variables between the hoisted zone and the rest of the file.

const { mockPool } = vi.hoisted(() => {
  const mockRows = [
    { id: "p-1001", title: "TrailRunner Pro", description: "Lightweight trail running shoes with extra grip and breathable mesh for long distance comfort.", category: "shoes", brand: "StrideX", price: "89.99", currency: "USD", in_stock: true, rating: "4.5" },
    { id: "p-1002", title: "CityWalk Lite", description: "Everyday sneakers with memory foam support, ideal for walking and casual office use.", category: "shoes", brand: "UrbanStep", price: "64.50", currency: "USD", in_stock: true, rating: "4.2" },
    { id: "p-2001", title: "FlexFit Performance Tee", description: "Moisture-wicking training t-shirt with stretch fabric for gym, running, and sports.", category: "apparel", brand: "Athletica", price: "29.99", currency: "USD", in_stock: true, rating: "4.3" },
    { id: "p-3001", title: "NoiseBlock Wireless Headphones", description: "Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life.", category: "electronics", brand: "SoundPeak", price: "129.00", currency: "USD", in_stock: false, rating: "4.6" },
    { id: "p-4001", title: "HomeBrew Coffee Maker", description: "Programmable drip coffee machine with reusable filter and 12-cup glass carafe.", category: "home", brand: "KitchenNest", price: "79.00", currency: "USD", in_stock: true, rating: "4.1" }
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
      message: "show me running shoes under $100"
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendedProducts)).toBe(true);
    expect(res.body.recommendedProducts.length).toBeGreaterThan(0);
    expect(res.body.appliedFilters.maxPrice).toBe(100);
    expect(res.body.appliedFilters.category).toBe("shoes");
  });

  it("ingests products and returns count", async () => {
    const res = await request(app).post("/ingest");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(5);
  });
});

