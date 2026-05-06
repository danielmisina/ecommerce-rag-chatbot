import OpenAI from "openai";
import { env } from "../config/env";
import { RetrievedProduct } from "../types";

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
  matches: RetrievedProduct[]
): Promise<string> => {
  if (!client) {
    return fallbackAnswer(message, matches);
  }

  const context = matches
    .map(
      ({ product, score }) =>
        `ID: ${product.id}\nTitle: ${product.title}\nBrand: ${product.brand}\nCategory: ${product.category}\nPrice: ${product.price} ${product.currency}\nInStock: ${product.inStock}\nScore: ${score.toFixed(3)}\nDescription: ${product.description}`
    )
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
          "You are an ecommerce assistant. Answer only using provided context. If context is insufficient, say you do not know and ask a clarifying question."
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

