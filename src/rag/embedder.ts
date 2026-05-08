import OpenAI from "openai";
import { env } from "../config/env";

const client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;

export const getEmbedding = async (text: string): Promise<number[] | null> => {
  if (!client) return null;

  const response = await client.embeddings.create({
    model: env.openAiEmbeddingModel,
    input: text
  });

  return response.data[0].embedding;
};

