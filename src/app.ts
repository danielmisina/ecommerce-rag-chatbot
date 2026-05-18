import express from "express";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { pool as defaultPool } from "./db/client";
import { ingestProducts, ingestArticles } from "./rag/ingest";
import { generateAnswer } from "./rag/generator";
import { retrieveProducts, retrieveDocuments } from "./rag/retriever";
import { ChatResponse } from "./types";

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1)
});

export const createApp = (pool: Pool = defaultPool) => {
  const app = express();
  app.use(express.json());
  const chatUiPath = path.resolve(process.cwd(), "public", "chat.html");

  app.get("/", (_req, res) => {
    res.json({
      name: "ecommerce-rag-chatbot",
      ok: true,
      endpoints: [
        "GET /health",
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

  app.post("/ingest", async (_req, res) => {
    const count = await ingestProducts(pool);
    res.json({ ok: true, count });
  });

  app.post("/ingest/articles", async (_req, res) => {
    const count = await ingestArticles(pool);
    res.json({ ok: true, count });
  });

  app.post("/chat", async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const [{ filters, matches }, docChunks] = await Promise.all([
      retrieveProducts(parsed.data.message, pool, 3),
      retrieveDocuments(parsed.data.message, pool, 3),
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
