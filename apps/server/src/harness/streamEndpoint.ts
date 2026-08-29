// harness/streamEndpoint.ts — M26 real provider streaming + harness flow (SSE)
// Follows the exact Claude flow: design system → slices → unhappy → polish

import { getCaideRunner, handleVerifySlice } from "./wsCaide";
import { CaideHarness, type ProviderConfig } from "./harnessRun";
import { join } from "node:path";
import { homedir } from "node:os";
import { readdir } from "node:fs/promises";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");

export async function handleVerifySliceHttp(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { threadId?: string; turnId?: string; sliceSpec?: string; screenshotBase64?: string | null };
  const res = await handleVerifySlice({
    threadId: body.threadId ?? "thread-test",
    turnId: body.turnId ?? `turn-${Date.now()}`,
    sliceSpec: body.sliceSpec ?? "preview:screenshot",
    screenshotBase64: body.screenshotBase64 ?? null,
  });
  return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
}

export async function handleStreamProvider(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    threadId?: string;
    turnId?: string;
    model?: string;
    prompt?: string;
    baseUrl?: string;
    apiKey?: string;
    projectId?: string;
    framework?: string;
  };

  const threadId = body.threadId ?? `thread-${Date.now()}`;
  const model = body.model ?? "deepseek-v4-flash";
  const prompt = body.prompt ?? "hey";
  const baseUrl = body.baseUrl ?? "https://opencode.ai/zen/v1";
  const apiKey = body.apiKey ?? process.env.OPENCODE_ZEN_API_KEY ?? "";
  const projectId = body.projectId ?? "default";
  const framework = body.framework ?? "blank";

  const provider: ProviderConfig = { model, baseUrl, apiKey };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (text: string) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      const emitEvent = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event })}\n\n`));

      try {
        // Run the exact Claude flow
        const harness = new CaideHarness();
        const events = await harness.runBuildFlow(prompt, threadId, framework, projectId, provider);

        // Stream events to client
        for (const event of events) {
          emitEvent(event as unknown as Record<string, unknown>);

          // Also emit tokens for the design system / code generation
          if (event.type === "design-system" && event.data.status === "complete") {
            emit(`Design system established.\n\n`);
          }
          if (event.type === "slice") {
            emit(`Built: ${event.data.filename}\n\n`);
          }
          if (event.type === "unhappy" && event.data.status === "complete") {
            emit(`Unhappy paths generated.\n\n`);
          }
          if (event.type === "polish" && event.data.status === "complete") {
            emit(`Polish pass complete.\n\n`);
          }
          if (event.type === "complete") {
            emit(`Build complete — ${event.data.totalScreens} screens, ${event.data.framework}\n\n`);
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitEvent({ type: "error", message: msg });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
