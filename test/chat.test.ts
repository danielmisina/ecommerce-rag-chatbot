import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockPool } = vi.hoisted(() => {
  const mockRows = [
    { id: "tri-s001", title: "Orca Athlex Flex Wetsuit", description: "Full-sleeve open-water triathlon wetsuit.", category: "swim", brand: "Orca", price: "299.99", currency: "USD", in_stock: true, rating: "4.7", url: null, carbs_per_serving: null },
    { id: "tri-b002", title: "Giro Aerohead MIPS Helmet", description: "Aerodynamic TT cycling helmet.", category: "bike", brand: "Giro", price: "249.99", currency: "USD", in_stock: true, rating: "4.7", url: null, carbs_per_serving: null },
    { id: "tri-r001", title: "ASICS Gel-Nimbus 26", description: "Premium long-distance running shoe.", category: "run", brand: "ASICS", price: "164.99", currency: "USD", in_stock: true, rating: "4.7", url: null, carbs_per_serving: null },
  ];

  // Gel row returned by /calculate/gels (auto-select query)
  const mockGelRow = {
    id: "tri-n005",
    title: "Maurten Gel 100",
    brand: "Maurten",
    price: "4.50",
    url: "https://www.maurten.com/products/gel-100",
    carbs_per_serving: 25,
  };

  const mockPool = {
    query: vi.fn().mockImplementation((sql: string) => {
      const upper = typeof sql === "string" ? sql.trim().toUpperCase() : "";
      if (upper.startsWith("SELECT") && upper.includes("CARBS_PER_SERVING") && upper.includes("RATING DESC")) {
        // auto-select gel query
        return Promise.resolve({ rows: [mockGelRow] });
      }
      if (upper.startsWith("SELECT")) {
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
    expect(res.body.endpoints).toContain("POST /calculate/gels");
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
    expect(res.body.count).toBe(27);
  });

  it("calculates gels for a race type preset", async () => {
    const res = await request(app).post("/calculate/gels").send({
      raceType: "ironman",
      leg: "bike",
      carbsPerHour: 60
    });
    expect(res.status).toBe(200);
    expect(res.body.raceType).toBe("ironman");
    expect(res.body.leg).toBe("bike");
    expect(res.body.durationMinutes).toBe(360);
    expect(res.body.totalCarbsNeeded).toBe(360);   // 60g/hr × 6h
    expect(res.body.gelsNeeded).toBe(15);           // ceil(360/25)
    expect(res.body.product.id).toBe("tri-n005");
    expect(Array.isArray(res.body.notes)).toBe(true);
  });

  it("calculates gels for a custom duration", async () => {
    const res = await request(app).post("/calculate/gels").send({
      durationMinutes: 120,
      carbsPerHour: 60
    });
    expect(res.status).toBe(200);
    expect(res.body.durationMinutes).toBe(120);
    expect(res.body.totalCarbsNeeded).toBe(120);   // 60g/hr × 2h
    expect(res.body.gelsNeeded).toBe(5);            // ceil(120/25)
  });

  it("rejects /calculate/gels with no raceType or durationMinutes", async () => {
    const res = await request(app).post("/calculate/gels").send({ carbsPerHour: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});


