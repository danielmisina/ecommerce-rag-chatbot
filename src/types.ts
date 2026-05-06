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
};

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
};
