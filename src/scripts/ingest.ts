import { loadProducts } from "../rag/ingest";
import { retrieveProducts } from "../rag/retriever";

const products = loadProducts();
const sampleQuery = "I need running shoes under $100";
const { filters, matches } = retrieveProducts(sampleQuery, products, 3);

console.log(`Loaded ${products.length} products.`);
console.log("Sample query:", sampleQuery);
console.log("Applied filters:", filters);
console.log(
  "Top matches:",
  matches.map((item) => ({ id: item.product.id, title: item.product.title, score: item.score.toFixed(3) }))
);

