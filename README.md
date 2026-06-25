# Vulcan OmniPro 220 Assistant

A multimodal agent for the Vulcan OmniPro 220 welder, built with the Claude Agent SDK. You can ask it about setup, polarity, duty cycle, settings, or troubleshooting and it answers like someone who actually knows the machine. When text isn't enough it pulls up the exact manual page, draws a diagram, or gives you an interactive calculator.

Live demo: https://prox-challenge-production-f288.up.railway.app
Video for the demo: https://www.loom.com/share/babb800b34c547d7bdbd0f7ff87c9474

## What it does

The manual is 48 pages of dense stuff: duty cycle tables, polarity setups that change per process, wiring schematics, weld diagnosis diagrams. A lot of the real questions can't be answered from one line of text. They need you to reference a table with an explanation somewhere else, or read a diagram, or know which of three similar procedures applies to your situation. So the agent does a few things beyond plain search:

It reasons across sections. Ask "what's the duty cycle for MIG at 200A on 240V" and it grabs the number from the specs table on page 7 and the rest-cycle explanation from page 19, then tells you what 25% actually means in practice (weld 2.5 minutes, rest 7.5).

It reads the visual stuff. When an answer depends on a table or schematic that comes out as garbage when you extract the text, the agent looks at the actual page image and reads it that way instead.

It shows you things and draws things. It'll surface the relevant manual page right in the chat, and for polarity questions it generates its own diagram of which cable goes in which socket instead of just describing it.

It gives you tools. Duty cycle questions render an interactive calculator you can adjust. Vague questions like "what settings should I use" get a clarifying question with buttons to pick from instead of a guess that's probably wrong.

## Running it

You need an Anthropic API key and a Voyage AI key (their free tier covers this easily).

```
cp .env.example .env      # put your two keys in .env
npm install
npm run dev
```

Then open http://localhost:3000. The example questions under the input box are a fast way to see what it does.

The manual's already been processed, so there's no setup step beyond the keys. The search index and the page images are committed to the repo. If you want to rebuild everything from scratch the scripts are in scripts/.

## How it works

### Getting the knowledge out of the manual

The manual gets processed once, offline, into three things the agent uses at runtime.

First, the text of each page, pulled out with pdf-parse and kept keyed by page number so the agent can always cite where an answer came from.

Second, an image of every page. These get used two ways: the agent reads them when it needs to interpret a diagram, and the app shows them to the user when seeing the page helps.

Third, each page image gets sent to Claude, which writes a short description of what's on it and tags what it contains (duty cycle table, polarity diagram, wiring schematic, and so on). I embed each page's text together with that description. The reason is that page text by itself is a weak signal here. The word polarity shows up on a bunch of pages, and the wiring schematic extracts as basically nothing. But if you embed the visual description alongside the text, a question like "which socket does the ground clamp go in" finds the right page even when the words don't line up, because the description carries the meaning the text extraction loses.

### Search

Embeddings are from Voyage's voyage-3 model and search is just cosine similarity over an in-memory index. With 48 pages there was no reason to set up a vector database, a JSON file and a dot product are faster, easier to follow, and one less thing for you to install to run this.

### The agent

It's a Claude Agent SDK query loop running server-side in a Next.js route, with six tools on an in-process MCP server:

1. search_manual: semantic search, returns relevant chunks with page numbers
2. view_manual_page: hands a page image to the agent so it can read a table or diagram itself
3. surface_manual_image : shows a manual page to the user in the chat
4. render_diagram : generates an SVG, mostly used for polarity/socket diagrams
5. show_duty_cycle_calculator: renders the interactive calculator, pre-set to whatever the question was about
6. ask_clarification: asks a follow-up with clickable options when the question is genuinely ambiguous

The split between view_manual_page and surface_manual_image is on purpose. They're different jobs. The agent often needs to read a page to answer correctly without the user ever needing to look at it, and the other way around, it sometimes shows you a page it didn't need to read itself.

### Showing the visual output

When a tool makes something for the user (an image, a diagram, the calculator, a clarification), it gets attached to the response and the frontend renders it under the text answer. Text is markdown. Images come straight out of the public folder. Diagrams are SVG the agent writes. The calculator is a real React component that the agent triggers with the right starting values.

## Some decisions I made

The calculator is a real component, not code the agent writes on the fly. The agent picks which component and sets the values, but the component itself is pre-built. Generating React at runtime is the more impressive-sounding route but it's flaky, and for something a person is using to figure out machine limits I'd rather it render correctly every single time than be dynamic and occasionally broken.

The SVG generation is constrained. The agent writes its own SVG, but the tool description locks down a tight spec: fixed canvas size, three colors (red for positive, blue for negative, dark for outlines), label everything, sockets as circles and cables as thick lines. Letting it draw freely is a coin flip on whether it comes out clean, and pinning the rules down makes the polarity diagrams come out consistent without taking away the agent's ability to draw the right thing for the specific question.

The calculator only shows what the manual actually says. The manual gives duty cycle at two points per process and voltage (the rated point and the 100% continuous point) and nothing in between. So the calculator shows those points and tells you when you're above, below, or near them, but it doesn't draw a smooth curve between them, because that curve would be made up. Inventing numbers to look more complete would just make it less accurate.

It'll add real welding knowledge where it helps. The agent leans on the manual and cites pages, but it'll also throw in genuinely useful practical stuff when it's relevant. For a garage user that's the right call. Somewhere stricter you'd probably want it to draw a harder line between what's from the manual and what's general knowledge.

## Things I'd fix with more time

It's not fast. A rich answer takes 15-20 seconds because the agent usually searches, then reads a page image, then writes the output. There's a thinking indicator while it works. Streaming the response would make it feel better.

## Layout

```
app/
  api/chat/route.ts      the agent: SDK loop plus the six tools
  page.tsx               chat UI, renders text/images/diagrams/components/clarifications
components/
  DutyCycleCalculator.tsx
lib/
  retrieval.ts           search over the committed index
scripts/
  ingest.ts              PDF to text, page images, and vision captions
  embed.ts               builds the embedding index
  query.ts               CLI for spot-checking search
data/                     committed: text, captions, index
public/manual/            committed: page images
```

## Built with

Next.js (App Router), TypeScript, the Claude Agent SDK, Voyage AI for embeddings, Tailwind. Deployed on a persistent Node host.