import dotenv from "dotenv";
import { searchManual } from "../lib/retrieval";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.error('Usage: npx tsx scripts/query.ts "your query here"');
    process.exit(1);
  }

  console.log(`Query: "${query}"\n`);
  const results = await searchManual(query, 5);

  if (results.length === 0) {
    console.log("No results returned.");
    return;
  }

  for (const r of results) {
    const snippet = r.text.replace(/\s+/g, " ").slice(0, 150);
    console.log(`[page ${r.page}] (${r.relevance.toFixed(3)}) ${snippet}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});