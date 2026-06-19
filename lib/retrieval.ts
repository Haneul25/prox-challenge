import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { VoyageAIClient } = require("voyageai") as typeof import("voyageai");

export type Chunk = {
  id: string;
  page: number;
  text: string;
  caption: string;
  tags: Record<string, boolean>;
  relevance: number;
};

type StoredChunk = Omit<Chunk, "relevance">;

type IndexFile = {
  chunks: StoredChunk[];
  embeddings: number[][];
};

const INDEX_PATH = join(process.cwd(), "data/index.json");
const EMBED_MODEL = "voyage-3";

let cachedIndex: IndexFile | null = null;

function loadIndex(): IndexFile {
  if (!cachedIndex) {
    cachedIndex = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as IndexFile;
  }
  return cachedIndex;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function searchManual(
  query: string,
  topK = 5
): Promise<Chunk[]> {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const { chunks, embeddings } = loadIndex();

  const client = new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
  });

  const response = await client.embed({
    input: query,
    model: EMBED_MODEL,
  });

  const queryEmbedding = response.data?.[0]?.embedding;
  if (!queryEmbedding) {
    throw new Error("No embedding returned for query");
  }

  const scored: Chunk[] = chunks.map((chunk, i) => ({
    ...chunk,
    relevance: cosineSimilarity(queryEmbedding, embeddings[i]),
  }));

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, topK);
}