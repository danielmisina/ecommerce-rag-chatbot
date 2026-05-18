export type Product = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  price: number;
  currency: string;
  inStock: boolean;
  rating: number;
  url?: string;
};

export type DocumentChunk = {
  id: string;
  sourceId: string;
  title: string;
  chunkIndex: number;
  body: string;
  tags: string[];
};

export type RetrievedDocument = {
  chunk: DocumentChunk;
  score: number;
};

// ...existing code...

export type RetrievedProduct = {
  product: Product;
  score: number;
};

export type ChatRequest = {
  sessionId?: string;
  message: string;
};

export type ChatResponse = {
  answer: string;
  recommendedProducts: Product[];
  citations: Array<{ id: string; title: string; score: number }>;
  appliedFilters: {
    maxPrice?: number;
    category?: string;
    inStockOnly: boolean;
  };
  knowledgeChunks?: Array<{ id: string; title: string; score: number }>;
};
