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
  carbsPerServing?: number;
};

// ...existing code...

export type RaceType = "sprint" | "olympic" | "70.3" | "ironman";
export type RaceLeg  = "bike" | "run" | "all";

export type GelCalculationInput = {
  raceType?: RaceType;
  durationMinutes?: number;
  leg: RaceLeg;
  gelId?: string;
  carbsPerHour: number;
};

export type GelCalculationResult = {
  raceType?: RaceType;
  leg: RaceLeg;
  durationMinutes: number;
  carbsPerHour: number;
  totalCarbsNeeded: number;
  gelsNeeded: number;
  product: Pick<Product, "id" | "title" | "brand" | "price" | "url" | "carbsPerServing">;
  notes: string[];
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
