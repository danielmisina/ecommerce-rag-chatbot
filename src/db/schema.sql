CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS tenants;

CREATE TABLE tenants (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT        NOT NULL,
  widget_key      TEXT        UNIQUE NOT NULL DEFAULT ('wk_' || gen_random_uuid()::text),
  widget_settings JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          TEXT         PRIMARY KEY,
  tenant_id   TEXT         NOT NULL REFERENCES tenants(id),
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

CREATE INDEX IF NOT EXISTS products_tenant_id_idx ON products(tenant_id);
CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products USING hnsw (embedding vector_cosine_ops);

CREATE TABLE documents (
  id          TEXT    PRIMARY KEY,
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  source_id   TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  chunk_index INTEGER NOT NULL,
  body        TEXT    NOT NULL,
  tags        TEXT[],
  embedding   vector(1536)
);

CREATE INDEX IF NOT EXISTS documents_tenant_id_idx ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING hnsw (embedding vector_cosine_ops);
