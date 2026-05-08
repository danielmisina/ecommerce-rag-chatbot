import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://raguser:ragpass@localhost:5432/ragdb"
};
