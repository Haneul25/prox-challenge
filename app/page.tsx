"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type SurfacedImage = {
  page: number;
  caption: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  images?: SurfacedImage[];
};

const EXAMPLE_QUESTIONS = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await res.json()) as {
        text?: string;
        error?: string;
        images?: SurfacedImage[];
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.text ?? "",
          ...(data.images?.length ? { images: data.images } : {}),
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages([
        ...nextMessages,
        { role: "assistant", content: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4">
        <header className="border-b border-zinc-200 py-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Vulcan OmniPro 220 Assistant
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Technical help for your multiprocess welder — ask about setup,
            settings, and troubleshooting.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 py-4">
          {EXAMPLE_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={loading}
              onClick={() => setInput(question)}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {messages.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-zinc-500">
              Ask a question about your welder, or pick an example above.
            </p>
          )}

          <div className="flex flex-col gap-4">
            {messages.map((message, i) => (
              <div
                key={i}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "whitespace-pre-wrap bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-900"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <>
                      <div className="[&_a]:underline [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {message.images?.map((image, j) => (
                        <figure key={j} className="mt-3">
                          <img
                            src={`/manual/page-${image.page}.png`}
                            alt={image.caption}
                            className="max-w-full rounded-lg border border-zinc-200"
                          />
                          <figcaption className="mt-1.5 text-xs text-zinc-500">
                            {image.caption}
                          </figcaption>
                        </figure>
                      ))}
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
                  Thinking…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50 py-4"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Ask about setup, duty cycle, polarity…"
              disabled={loading}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
