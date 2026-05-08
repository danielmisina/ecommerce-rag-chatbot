import express from "express";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { pool as defaultPool } from "./db/client";
import { ingestProducts } from "./rag/ingest";
import { generateAnswer } from "./rag/generator";
import { retrieveProducts } from "./rag/retriever";
import { calculateGels } from "./rag/calculator";
import { ChatResponse } from "./types";

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1)
});

const calculateGelsSchema = z.object({
  raceType: z.enum(["sprint", "olympic", "70.3", "ironman"]).optional(),
  durationMinutes: z.number().positive().optional(),
  leg: z.enum(["bike", "run", "all"]).default("all"),
  gelId: z.string().optional(),
  carbsPerHour: z.number().min(30).max(120).default(60),
}).refine(
  (d) => d.raceType != null || d.durationMinutes != null,
  { message: 'Provide either "raceType" or "durationMinutes".' }
);

export const createApp = (pool: Pool = defaultPool) => {
  const app = express();
  app.use(express.json());
  const chatUiPath = path.resolve(process.cwd(), "public", "chat.html");

  app.get("/", (_req, res) => {
    res.json({
      name: "ecommerce-rag-chatbot",
      ok: true,
      endpoints: ["GET /health", "POST /ingest", "POST /chat", "POST /calculate/gels"]
    });
  });

  app.get("/chat-ui", (_req, res) => {
    res.sendFile(chatUiPath);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/ingest", async (_req, res) => {
    const count = await ingestProducts(pool);
    res.json({ ok: true, count });
  });

  app.post("/chat", async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const { filters, matches } = await retrieveProducts(parsed.data.message, pool, 3);
    const answer = await generateAnswer(parsed.data.message, matches);

    const response: ChatResponse = {
      answer,
      recommendedProducts: matches.map((match) => match.product),
      citations: matches.map((match) => ({
        id: match.product.id,
        title: match.product.title,
        score: Number(match.score.toFixed(3))
      })),
      appliedFilters: filters
    };

    return res.json(response);
  });

  app.post("/calculate/gels", async (req, res) => {
    const parsed = calculateGelsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    try {
      const result = await calculateGels(parsed.data, pool);
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Calculation failed.";
      return res.status(400).json({ error: message });
    }
  });

  return app;
};
