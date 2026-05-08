# Triathlon Gear RAG Chatbot (Node.js + TypeScript)

A RAG-powered chatbot specialised in triathlon and endurance sports gear, built with Node.js + TypeScript.

## What is included

- Express API with `POST /chat`, `POST /ingest`, and `GET /health`
- PostgreSQL + pgvector for product storage and vector similarity search
- OpenAI `text-embedding-3-small` embeddings at ingest & retrieval time
- Keyword cosine-similarity fallback when no OpenAI key is configured
- 21-product triathlon seed catalog in `src/data/products.json` (swim, bike, run, nutrition, gear)
- Triathlon-specialist system prompt covering T1/T2, brick sessions, race nutrition, and more
- Optional OpenAI answer generation (fallback response works without API key)
- Test harness with Vitest + Supertest (mocked DB — no real Postgres needed for tests)

## Project structure

- `src/app.ts` - API routes and response shape
- `src/db/client.ts` - singleton `pg.Pool` constructed from `DATABASE_URL`
- `src/db/schema.sql` - `CREATE TABLE products` with `vector(1536)` embedding column
- `src/db/migrate.ts` - runnable migration script (`npm run migrate`)
- `src/rag/embedder.ts` - OpenAI `text-embedding-3-small` wrapper (returns `null` when no key)
- `src/rag/retriever.ts` - vector search via `<=>` operator; keyword fallback when no embeddings
- `src/rag/generator.ts` - OpenAI-backed or fallback answer generation
- `src/rag/ingest.ts` - loads `products.json`, embeds each product, upserts into Postgres
- `src/scripts/ingest.ts` - CLI runner for ingestion/retrieval smoke check
- `test/chat.test.ts` - endpoint tests (pool + embedder + generator mocked)
- `public/chat.html` - browser chat page that calls `POST /chat`

## Quick start

### 1. Start Postgres with pgvector

```bash
docker compose up -d
```

### 2. Install dependencies & run migration

```bash
npm install
npm run migrate
```

### 3. Copy env file

```bash
cp .env.example .env
# Edit .env — add OPENAI_API_KEY for real embeddings & answers (optional)
```

### 4. Ingest the seed catalog

```bash
npm run ingest
```

### 5. Run tests & start server

```bash
npm test
npm run dev
```

API starts on `http://localhost:3000` by default.

Open the browser chat UI at `http://localhost:3000/chat-ui`.

## API examples

### Health

```bash
curl http://localhost:3000/health
```

### Chat

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I need running shoes under $100"}'
```

### Ingest

```bash
curl -X POST http://localhost:3000/ingest
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API port |
| `DATABASE_URL` | `postgres://raguser:ragpass@localhost:5432/ragdb` | Postgres connection string |
| `OPENAI_API_KEY` | _(empty)_ | Optional; keyword fallback used when missing |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for answer generation |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Model used for embeddings |

## How retrieval works

```
POST /chat  →  embed query (OpenAI)  →  SELECT ... ORDER BY embedding <=> $1 (pgvector)
                     ↓ no API key
               keyword TF cosine similarity (in-memory fallback)
```

## Next upgrades

- Add hybrid retrieval (keyword + vector re-ranking)
- Add session memory and conversation storage
- Add evaluation dataset for quality tracking
