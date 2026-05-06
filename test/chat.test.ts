import request from "supertest";
import { describe, expect, it } from "vitest";
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
});

