import express from "express";
import path from "node:path";
import { z } from "zod";
import { loadProducts } from "./rag/ingest";
import { generateAnswer } from "./rag/generator";
import { retrieveProducts } from "./rag/retriever";
import { ChatResponse } from "./types";

const chatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1)
});

export const createApp = () => {
  const app = express();
  app.use(express.json());
  const chatUiPath = path.resolve(process.cwd(), "public", "chat.html");

  app.get("/", (_req, res) => {
    res.json({
      name: "ecommerce-rag-chatbot",
      ok: true,
      endpoints: ["GET /health", "POST /ingest", "POST /chat"]
    });
  });

  app.get("/chat-ui", (_req, res) => {
    res.sendFile(chatUiPath);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/ingest", (_req, res) => {
    const products = loadProducts();
    res.json({ ok: true, count: products.length });
  });

  app.post("/chat", async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const products = loadProducts();
    const { filters, matches } = retrieveProducts(parsed.data.message, products, 3);
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

  return app;
};

