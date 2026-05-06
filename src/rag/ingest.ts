import productsJson from "../data/products.json";
import { Product } from "../types";

let productsCache: Product[] | null = null;

export const loadProducts = (): Product[] => {
  if (productsCache) return productsCache;

  const parsed = productsJson as Product[];
  productsCache = parsed;
  return parsed;
};

export const clearProductsCache = (): void => {
  productsCache = null;
};

