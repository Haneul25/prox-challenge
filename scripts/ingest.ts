import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { pdfToPng } from "pdf-to-png-converter";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PDF_PATH = "files/owner-manual.pdf";
const TEXT_OUT = "data/pages-text.json";
const VISION_OUT = "data/pages-vision.json";
const PNG_DIR = "public/manual";
const VIEWPORT_SCALE = 2.0;
const VISION_MODEL = "claude-sonnet-4-5";

const TAG_KEYS = [
  "front_panel_diagram",
  "interior_controls_diagram",
  "polarity_diagram",
  "duty_cycle_table",
  "duty_cycle_visual",
  "wire_feed_mechanism",
  "wiring_schematic",
  "weld_defect_examples",
  "weld_penetration_diagram",
  "lcd_screens",
  "troubleshooting_table",
  "parts_list_or_assembly",
  "settings_chart",
] as const;

type VisionTags = Record<(typeof TAG_KEYS)[number], boolean>;
type PageVision = {
  caption: string;
  tags: VisionTags;
};
type PagesVision = Record<number, PageVision>;

function buildVisionPrompt(pageNum: number): string {
  return `This is page ${pageNum} of the Vulcan OmniPro 220 welding system owner's manual.
Describe in 2-3 sentences what visual content is on this page.
Then on a new line, output a JSON object with these boolean fields, set to true if this page prominently features that asset:
{
  "front_panel_diagram": ...,
  "interior_controls_diagram": ...,
  "polarity_diagram": ...,
  "duty_cycle_table": ...,
  "duty_cycle_visual": ...,
  "wire_feed_mechanism": ...,
  "wiring_schematic": ...,
  "weld_defect_examples": ...,
  "weld_penetration_diagram": ...,
  "lcd_screens": ...,
  "troubleshooting_table": ...,
  "parts_list_or_assembly": ...,
  "settings_chart": ...
}`;
}

function listPageNumbers(pngDir: string): number[] {
  return readdirSync(pngDir)
    .map((file) => /^page-(\d+)\.png$/.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

function parseVisionResponse(text: string): PageVision {
  // Remove markdown code fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "");

  // Grab from the first { to the last } (the only braces should be the tag object)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch || jsonMatch.index === undefined) {
    throw new Error("No JSON object found in Claude response");
  }

  const caption = cleaned.slice(0, jsonMatch.index).trim();
  const rawTags = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const tags = Object.fromEntries(
    TAG_KEYS.map((key) => [key, rawTags[key] === true])
  ) as VisionTags;
  return { caption, tags };
}

async function ingestPdfAndRasterize(): Promise<number> {
  const pdfBuffer = readFileSync(PDF_PATH);
  mkdirSync(dirname(TEXT_OUT), { recursive: true });
  mkdirSync(PNG_DIR, { recursive: true });

  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText({ pageJoiner: "" });
  const totalPages = textResult.total;

  const pagesText: Record<number, string> = {};
  for (const page of textResult.pages) {
    console.log(`Extracting text — page ${page.num} of ${totalPages}...`);
    pagesText[page.num] = page.text;
  }

  writeFileSync(TEXT_OUT, JSON.stringify(pagesText, null, 2));
  await parser.destroy();

  console.log(`Rasterizing ${totalPages} pages to PNG...`);
  const pngPages = await pdfToPng(PDF_PATH, {
    viewportScale: VIEWPORT_SCALE,
    outputFolder: PNG_DIR,
    outputFileMaskFunc: (n) => `page-${n}.png`,
    returnPageContent: false,
  });

  console.log(
    `Done. Wrote ${TEXT_OUT} and ${pngPages.length} PNGs under ${PNG_DIR}/`
  );
  return totalPages;
}

async function ingestVision(pageNumbers: number[]): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic();
  mkdirSync(dirname(VISION_OUT), { recursive: true });

  const pagesVision: PagesVision = {};
  let done = 0;
  for (const pageNum of pageNumbers) {
    done++;
    console.log(
      `Vision caption — page ${pageNum} (${done}/${pageNumbers.length})...`
    );
    const imagePath = join(PNG_DIR, `page-${pageNum}.png`);
    const imageBase64 = readFileSync(imagePath).toString("base64");

    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: buildVisionPrompt(pageNum),
            },
          ],
        },
      ],
    });

    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    pagesVision[pageNum] = parseVisionResponse(responseText);
  }

  writeFileSync(VISION_OUT, JSON.stringify(pagesVision, null, 2));
  console.log(`Done. Wrote ${VISION_OUT}`);
}

async function main(): Promise<void> {
  const onlyVision = process.argv.includes("--only-vision");

  if (onlyVision) {
    const pageNumbers = listPageNumbers(PNG_DIR);
    if (pageNumbers.length === 0) {
      throw new Error(`No page PNGs found in ${PNG_DIR}/`);
    }
    await ingestVision(pageNumbers); 
    return;
  }

  const totalPages = await ingestPdfAndRasterize();
  await ingestVision(Array.from({ length: totalPages }, (_, i) => i + 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});