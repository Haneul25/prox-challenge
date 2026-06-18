import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import dotenv from "dotenv";
import { VoyageAIClient } from "voyageai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const TEXT_PATH = "data/pages-text.json";
const VISION_PATH = "data/pages-vision.json";
const INDEX_PATH = "data/index.json";
const EMBED_MODEL = "voyage-3";
const BATCH_SIZE = 16;

type Chunk = {
  id: string;
  page: number;
  text: string;
  caption: string;
  tags: Record<string, boolean>;
};

type PageVision = {
  caption: string;
  tags: Record<string, boolean>;
};

type IndexFile = {
  chunks: Chunk[];
  embeddings: number[][];
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function pageNumbersFromKeys(
  pagesText: Record<string, string>,
  pagesVision: Record<string, PageVision>
): number[] {
  const keys = new Set([
    ...Object.keys(pagesText),
    ...Object.keys(pagesVision),
  ]);

  return [...keys]
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}

function buildEmbeddingInput(text: string, caption: string): string {
  return `${text}\n\nVisual content: ${caption}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function embedBatches(
  client: VoyageAIClient,
  inputs: string[]
): Promise<number[][]> {
  const batches = chunkArray(inputs, BATCH_SIZE);
  const embeddings: number[][] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const start = i * BATCH_SIZE + 1;
    const end = start + batch.length - 1;
    console.log(
      `Embedding batch ${i + 1} of ${batches.length} (pages ${start}–${end})...`
    );

    const response = await client.embed({
      input: batch,
      model: EMBED_MODEL,
    });

    const items = [...(response.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0)
    );

    if (items.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} embeddings, got ${items.length}`
      );
    }

    for (const item of items) {
      if (!item.embedding) {
        throw new Error("Missing embedding in Voyage response");
      }
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}

async function main(): Promise<void> {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const pagesText = loadJson<Record<string, string>>(TEXT_PATH);
  const pagesVision = loadJson<Record<string, PageVision>>(VISION_PATH);
  const pageNumbers = pageNumbersFromKeys(pagesText, pagesVision);

  if (pageNumbers.length === 0) {
    throw new Error("No pages found in input JSON files");
  }

  console.log(`Building ${pageNumbers.length} chunks...`);

  const chunks: Chunk[] = pageNumbers.map((page) => {
    const key = String(page);
    const vision = pagesVision[key];

    return {
      id: `p${page}`,
      page,
      text: pagesText[key] ?? "",
      caption: vision?.caption ?? "",
      tags: vision?.tags ?? {},
    };
  });

  const embedInputs = chunks.map((chunk) =>
    buildEmbeddingInput(chunk.text, chunk.caption)
  );

  const client = new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
  });

  const embeddings = await embedBatches(client, embedInputs);

  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding count does not match chunk count");
  }

  const index: IndexFile = { chunks, embeddings };

  mkdirSync(dirname(INDEX_PATH), { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index));

  console.log(
    `Done. Wrote ${INDEX_PATH} (${chunks.length} chunks, ${embeddings[0]?.length ?? 0}-dim vectors)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});