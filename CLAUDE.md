# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Triathlon-specialised RAG chatbot built with Node.js + TypeScript. The system combines product catalog search with a knowledge base of triathlon articles to answer gear and nutrition questions. Uses PostgreSQL with pgvector for hybrid vector + keyword retrieval.

## Development Commands

### Setup & Migration
```bash
# Start PostgreSQL with pgvector
docker compose up -d

# Install dependencies
npm install

# Run database migration (creates products & documents tables with vector columns)
npm run migrate

# Ingest product catalog (21 triathlon products)
npm run ingest

# Ingest knowledge base articles (markdown files in src/data/articles/)
npm run ingest:articles
```

### Development
```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run all tests (Vitest with mocked DB)
npm test
```

### Single Test Execution
Vitest doesn't provide a built-in way to run a single test file. Use grep patterns:
```bash
# Run specific test file
npx vitest run test/chat.test.ts

# Run specific test case by name
npx vitest run -t "should return 400"
```

## Architecture

### Core Data Flow

1. **Ingestion** (`src/rag/ingest.ts`)
   - Products: Reads `src/data/products.json`, generates embeddings, upserts to `products` table
   - Articles: Reads markdown from `src/data/articles/`, chunks with overlap, embeds each chunk, stores in `documents` table
   - Uses `src/rag/chunker.ts` for sliding-window chunking (250 words, 25-word overlap)

2. **Retrieval** (`src/rag/retriever.ts`)
   - **Hybrid approach**: Vector similarity (pgvector `<=>` operator) when OpenAI key available, else keyword TF cosine fallback
   - `retrieveProducts()`: Parses filters (price, category, stock) from query, applies them in SQL WHERE clause
   - `retrieveDocuments()`: Pure vector search on knowledge base chunks
   - Category aliases: Maps user terms like "wetsuit" → "swim", "gel" → "nutrition"

3. **Generation** (`src/rag/generator.ts`)
   - Combines product matches + knowledge chunks into single context
   - Sends to OpenAI with triathlon-specialist system prompt (understands T1/T2, brick sessions, FTP, etc.)
   - Fallback: Formats bullet-point response when no API key configured

4. **Calculator** (`src/rag/calculator.ts`)
   - Race-specific gel calculator with presets for sprint/olympic/70.3/ironman
   - Fetches gel product from DB, calculates gels needed based on carbs/hour target
   - Returns contextual notes (e.g., "gut training needed above 60 g/hr")

### Database Schema

Two tables with pgvector HNSW indices:

- **products**: Standard e-commerce fields + `embedding vector(1536)` + `carbs_per_serving` (for nutrition products)
- **documents**: Knowledge base chunks with `source_id`, `chunk_index`, `body`, `tags[]`, `embedding vector(1536)`

### API Endpoints

- `POST /chat` → Main RAG endpoint. Retrieves products + doc chunks, generates answer, returns structured response with `appliedFilters`, `citations`, `knowledgeChunks`
- `POST /calculate/gels` → Nutrition calculator. Accepts `raceType`/`durationMinutes`, `leg`, `gelId`, `carbsPerHour`. Returns `gelsNeeded` + contextual `notes[]`
- `POST /ingest` → Re-ingest product catalog
- `POST /ingest/articles` → Re-ingest knowledge base articles
- `GET /chat-ui` → Serves `public/chat.html` browser UI

### Key Files

- `src/app.ts` - Express app factory with all route handlers and Zod schemas
- `src/db/client.ts` - Singleton `pg.Pool` instance from `DATABASE_URL`
- `src/db/schema.sql` - Table definitions (run via `npm run migrate`)
- `src/rag/embedder.ts` - OpenAI `text-embedding-3-small` wrapper (returns `null` when no key)
- `src/rag/retriever.ts` - Category parsing, filter extraction, vector + keyword hybrid search
- `src/rag/generator.ts` - Triathlon-specialist system prompt, context assembly, OpenAI call
- `src/rag/calculator.ts` - Gel calculation logic with race presets and advisory notes
- `src/rag/chunker.ts` - Markdown chunking with sliding window
- `src/types.ts` - All TypeScript interfaces (`Product`, `DocumentChunk`, `ChatResponse`, etc.)
- `src/config/env.ts` - Environment variable loading with dotenv
- `test/chat.test.ts` - Supertest integration tests with mocked pool/embedder/generator

### Testing Notes

- Tests use Vitest + Supertest
- Database pool, embedder, and generator are mocked in tests
- No real Postgres or OpenAI calls during test execution
- Test file location: `test/chat.test.ts`

## Environment Variables

Required: `DATABASE_URL` (defaults to local docker-compose setup)

Optional: `OPENAI_API_KEY` (enables real embeddings + answer generation; system degrades gracefully to keyword fallback when missing)

See `.env.example` for full list.

## Triathlon Domain Context

The system is specialised for triathlon and endurance sports. The product catalog spans five categories:
- **swim**: wetsuits, goggles, trisuits
- **bike**: bikes, helmets, trainers
- **run**: shoes, apparel
- **nutrition**: gels, electrolytes, recovery drinks (products have `carbsPerServing` field)
- **gear**: watches, heart rate monitors, race bags

Knowledge base articles cover race nutrition strategies, GI issue prevention, electrolyte management, pre-race fueling, and gel type comparisons.

The generator's system prompt understands triathlon-specific terminology: T1/T2 transitions, brick workouts, FTP, VO2max, long-course vs short-course racing, open-water swimming, periodised training.
