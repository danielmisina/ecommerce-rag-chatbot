import OpenAI from "openai";
import { env } from "../config/env";
import { RetrievedProduct, RetrievedDocument } from "../types";

const client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;

const fallbackAnswer = (message: string, matches: RetrievedProduct[]): string => {
  if (!matches.length) {
    return "I could not find a good product match in the current catalog. Try a different category, budget, or feature.";
  }

  const bullets = matches
    .map(
      ({ product }) =>
        `- ${product.title} (${product.brand}) - $${product.price.toFixed(2)}: ${product.description}`
    )
    .join("\n");

  return [
    `Based on your request (\"${message}\"), here are the best options I found:`,
    bullets,
    "",
    "If you want, I can narrow this down further by budget, category, or specific features."
  ].join("\n");
};

export const generateAnswer = async (
  message: string,
  matches: RetrievedProduct[],
  docChunks: RetrievedDocument[] = []
): Promise<string> => {
  if (!client) {
    return fallbackAnswer(message, matches);
  }

  const productContext = matches
    .map(
      ({ product, score }) =>
        `ID: ${product.id}\nTitle: ${product.title}\nBrand: ${product.brand}\nCategory: ${product.category}\nPrice: ${product.price} ${product.currency}\nInStock: ${product.inStock}\nScore: ${score.toFixed(3)}\nURL: ${product.url ?? "N/A"}\nDescription: ${product.description}`
    )
    .join("\n\n");

  const knowledgeContext = docChunks
    .map(
      ({ chunk, score }) =>
        `Source: ${chunk.title} (chunk ${chunk.chunkIndex}, score ${score.toFixed(3)})\n${chunk.body}`
    )
    .join("\n\n");

  const context = [
    productContext ? `PRODUCTS:\n${productContext}` : "",
    knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!context.trim()) {
    return fallbackAnswer(message, matches);
  }

  const response = await client.responses.create({
    model: env.openAiModel,
    input: [
      {
        role: "system",
        content:
          "You are a knowledgeable triathlon and endurance sports assistant for an online gear shop. " +
          "Your expertise spans all three disciplines — swim, bike, and run — as well as nutrition, training equipment, and race-day logistics. " +
          "You understand terms like T1/T2 transitions, brick sessions, FTP, VO2max, long-course vs short-course racing, open-water swimming, and periodised training. " +
          "You have access to both product listings and a knowledge base of triathlon articles. Use both to give complete, accurate answers. " +
          "Always recommend products based only on the provided context. If no suitable match exists, say so clearly and ask a helpful clarifying question. " +
          "When recommending nutrition products, always include the product URL as a clickable markdown link so the user can buy or read more."
      },
      {
        role: "user",
        content: `User question: ${message}\n\nRetrieved context:\n${context}`
      }
    ],
    temperature: 0.2
  });

  return response.output_text || fallbackAnswer(message, matches);
};
