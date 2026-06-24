import { searchManual } from "@/lib/retrieval";
import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const PNG_DIR = join(process.cwd(), "public/manual");

// Assumes single-user/sequential requests (fine for local demo, not concurrent-safe).
let surfacedImages: { page: number; caption: string }[] = [];

const SYSTEM_PROMPT =
  "You are a technical assistant for the Vulcan OmniPro 220 multiprocess welding system. The user just bought this welder and is setting it up in their garage — capable, but not a professional welder. For every technical question, call search_manual first to find relevant pages. When a question depends on a table, diagram, schematic, or photo — duty cycle values, polarity/socket setup, wiring, weld appearance — call view_manual_page on the relevant page to read it visually before answering. Don't rely on text extraction alone for visual content. When the user asks about something with important visual content — wiring schematic, weld-defect appearance, control panel, polarity setup — call surface_manual_image to show them the actual page, in addition to explaining it in words. Showing beats describing for visual questions. Cite page numbers like (page 7). Be concise: lead with the direct answer, then brief context.";

const searchManualTool = tool(
  "search_manual",
  "Search the Vulcan OmniPro 220 owner's manual for relevant pages. Returns the most relevant manual chunks with their page numbers.",
  {
    query: z.string().describe("what to search the manual for"),
  },
  async (args) => {
    const results = await searchManual(args.query, 5);
    const text = results
      .map(
        (result) =>
          `[page ${result.page}] (relevance ${result.relevance.toFixed(2)})\n${result.text}`
      )
      .join("\n\n");

    return {
      content: [{ type: "text", text }],
    };
  },
  {
    annotations: { readOnlyHint: true },
  }
);

const viewManualPageTool = tool(
  "view_manual_page",
  "Look at the actual image of a specific manual page to read tables, diagrams, schematics, or photos in detail. Use this when a question depends on visual content that text alone can't convey accurately — duty cycle tables, wiring schematics, weld-defect photos, polarity diagrams, control panel layouts.",
  {
    page: z.number().describe("the manual page number to view, 1-48"),
  },
  async (args) => {
    const imagePath = join(PNG_DIR, `page-${args.page}.png`);

    if (!existsSync(imagePath)) {
      return {
        content: [{ type: "text", text: `Page ${args.page} not found` }],
        isError: true,
      };
    }

    const data = readFileSync(imagePath).toString("base64");

    return {
      content: [{ type: "image", data, mimeType: "image/png" }],
    };
  },
  {
    annotations: { readOnlyHint: true },
  }
);

const surfaceManualImageTool = tool(
  "surface_manual_image",
  "Display an actual manual page image inline in the chat for the user to see. Use this when the user would benefit from seeing the real diagram, schematic, photo, or chart — e.g. the wiring schematic, weld-defect examples, control panel layout, polarity diagrams. This shows the image to the USER (distinct from view_manual_page, which lets YOU read it). Provide a short caption explaining what the image shows.",
  {
    page: z.number().describe("manual page number, 1-48"),
    caption: z
      .string()
      .describe("short caption describing what this page shows the user"),
  },
  async (args) => {
    surfacedImages.push({ page: args.page, caption: args.caption });

    return {
      content: [
        { type: "text", text: `Surfaced page ${args.page} to the user.` },
      ],
    };
  },
  {
    annotations: { readOnlyHint: true },
  }
);

const manualServer = createSdkMcpServer({
  name: "manual",
  version: "1.0.0",
  tools: [searchManualTool, viewManualPageTool, surfaceManualImageTool],
});

type ChatMessage = {
  role: string;
  content: string;
};

function getLatestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content.trim();
    }
  }
  return "";
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
    )
    .map((block) => block.text)
    .join("");
}

export async function POST(request: Request) {
  try {
    surfacedImages = [];

    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = body.messages ?? [];
    const prompt = getLatestUserMessage(messages);

    if (!prompt) {
      return NextResponse.json(
        { error: "No user message provided" },
        { status: 400 }
      );
    }

    const q = query({
      prompt,
      options: {
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: { manual: manualServer },
        allowedTools: [
          "mcp__manual__search_manual",
          "mcp__manual__view_manual_page",
          "mcp__manual__surface_manual_image",
        ],
      },
    });

    let assistantText = "";
    let finalText = "";

    for await (const message of q) {
      if (message.type === "assistant") {
        assistantText += extractAssistantText(message.message.content);
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          finalText = message.result;
        } else {
          throw new Error(message.errors.join("; ") || "Agent query failed");
        }
      }
    }

    return NextResponse.json({
      text: finalText || assistantText,
      images: surfacedImages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
