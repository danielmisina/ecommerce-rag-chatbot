CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id          TEXT         PRIMARY KEY,
  title       TEXT         NOT NULL,
  description TEXT         NOT NULL,
  category    TEXT         NOT NULL,
  brand       TEXT         NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  currency    TEXT         NOT NULL DEFAULT 'USD',
  in_stock    BOOLEAN      NOT NULL,
  rating      NUMERIC(3,1) NOT NULL,
  url         TEXT,
  embedding   vector(1536)
);

CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products USING hnsw (embedding vector_cosine_ops);

