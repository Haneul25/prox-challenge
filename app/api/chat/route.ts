import { searchManual } from "@/lib/retrieval";
import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are a technical assistant for the Vulcan OmniPro 220 multiprocess welding system. The user just bought this welder and is setting it up in their garage — capable, but not a professional welder. For every technical question, call search_manual first to find relevant pages. Cite page numbers like (page 7). Be concise: lead with the direct answer, then brief context.";

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

const manualServer = createSdkMcpServer({
  name: "manual",
  version: "1.0.0",
  tools: [searchManualTool],
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
        allowedTools: ["mcp__manual__search_manual"],
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

    return NextResponse.json({ text: finalText || assistantText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
