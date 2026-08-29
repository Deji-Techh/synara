// apps/server/src/main.ts — Pure Caide server (no dyad, no harness engine)
// Replaces 589-line Effect CLI that imported deleted persistence/orchestration/provider modules
// Routes: GET /health, POST /api/harness/stream (SSE), POST /api/harness/verify (JSON)

import { getCaideRunner } from "./harness/wsCaide";
import { handleVerifySlice } from "./harness/wsCaide";

const PORT = parseInt(process.env.CAIDE_PORT ?? "58080", 10);
const HOST = process.env.CAIDE_HOST ?? "127.0.0.1";

async function handleStream(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { threadId?: string; turnId?: string; prompt?: string; model?: string; baseUrl?: string; apiKey?: string };
  const threadId = body.threadId ?? `thread-${Date.now()}`;
  const turnId = body.turnId ?? `turn-${Date.now()}`;
  const model = body.model ?? "deepseek-v4-flash";
  const prompt = body.prompt ?? "hey";
  const baseUrl = body.baseUrl ?? process.env.OPENCODE_ZEN_URL ?? "https://opencode.ai/zen/v1";
  const apiKey = body.apiKey ?? process.env.OPENCODE_ZEN_API_KEY ?? "";

  const runner = getCaideRunner();
  runner.startTurn(threadId, turnId, "proj-default", "builder", "stage", []);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const onEvent = (e: { event: { type: string; content?: string } }) => {
        if (e.event.type === "token" && typeof (e.event as { content?: string }).content === "string") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: (e.event as { content: string }).content })}\n\n`));
        }
      };
      const off = runner.onEvent(onEvent as unknown as (e: CaideEvent) => void);
      try {
        await runner.streamProvider({ threadId, turnId, model, prompt, baseUrl, apiKey });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        off();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

async function handleVerify(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { threadId?: string; turnId?: string; sliceSpec?: string; screenshotBase64?: string | null };
  const res = await handleVerifySlice({
    threadId: body.threadId ?? "thread-test",
    turnId: body.turnId ?? `turn-${Date.now()}`,
    sliceSpec: body.sliceSpec ?? "preview:screenshot",
    screenshotBase64: body.screenshotBase64 ?? null,
  });
  return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", harness: "pure-caide" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/harness/stream" && req.method === "POST") {
      return handleStream(req);
    }
    if (url.pathname === "/api/harness/verify" && req.method === "POST") {
      return handleVerify(req);
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Pure Caide server running at http://${server.hostname}:${server.port}`);
console.log(`  GET  /health`);
console.log(`  POST /api/harness/stream  (SSE typed {token})`);
console.log(`  POST /api/harness/verify  (JSON handleVerifySlice)`);
