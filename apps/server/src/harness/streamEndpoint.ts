// harness/streamEndpoint.ts — expose caideRunner.streamProvider as HTTP SSE for ChatView real WS (M8/M26)
// Pure Caide, no dyad — replaces ChatView local setInterval echo

import { getCaideRunner } from "./wsCaide";

export async function handleStreamProvider(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { threadId?: string; turnId?: string; model?: string; prompt?: string; baseUrl?: string; apiKey?: string };
  const threadId = body.threadId ?? "thread-test";
  const turnId = body.turnId ?? `turn-${Date.now()}`;
  const model = body.model ?? "deepseek-v4-flash";
  const prompt = body.prompt ?? "hey";
  const baseUrl = body.baseUrl ?? "https://opencode.ai/zen/v1";
  const apiKey = body.apiKey ?? process.env.OPENCODE_ZEN_API_KEY ?? "test-key";

  const runner = getCaideRunner();
  runner.startTurn(threadId, turnId, "proj-test", "builder", "stage: ask hey", []);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const onEvent = (e: { event: { type: string; content?: string } }) => {
        if (e.event.type === "token" && typeof (e.event as { content?: string }).content === "string") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: (e.event as { content: string }).content })}\n\n`));
        }
      };
      const off = runner.onEvent(onEvent as unknown as (e: { threadId: string; turnId: string; event: { type: string } }) => void);
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

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
