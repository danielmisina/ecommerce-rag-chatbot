# Ecommerce RAG Chatbot (Node.js + TypeScript)

A minimal learning project for building an ecommerce chatbot using Retrieval-Augmented Generation (RAG).

## What is included

- Express API with `POST /chat`, `POST /ingest`, and `GET /health`
- Simple retrieval pipeline with query filters and similarity ranking
- Seed catalog in `src/data/products.json`
- Optional OpenAI answer generation (fallback response works without API key)
- Test harness with Vitest + Supertest

## Project structure

- `src/app.ts` - API routes and response shape
- `src/rag/retriever.ts` - filter parsing and similarity retrieval
- `src/rag/generator.ts` - OpenAI-backed or fallback answer generation
- `src/rag/ingest.ts` - product loading layer
- `src/scripts/ingest.ts` - tiny runner for ingestion/retrieval smoke check
- `test/chat.test.ts` - endpoint tests
- `public/chat.html` - browser chat page that calls `POST /chat`

## Quick start

1. Install dependencies
2. Copy `.env.example` to `.env` (optional for OpenAI)
3. Run tests
4. Start the API

```bash
npm install
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
curl -X POST http://localhost:3000/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message":"I need running shoes under $100"}'
```

### Ingest

```bash
curl -X POST http://localhost:3000/ingest
```

## Environment variables

- `PORT` - API port
- `OPENAI_API_KEY` - optional; if missing, deterministic fallback answers are used
- `OPENAI_MODEL` - optional; defaults to `gpt-4o-mini`

## Next upgrades

- Replace in-memory catalog loading with PostgreSQL + pgvector
- Add hybrid retrieval (keyword + vector)
- Add session memory and conversation storage
- Add evaluation dataset for quality tracking

