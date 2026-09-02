import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import {
  streamProvider,
  BlockAssembler,
  LLMStreamTiming,
  endpointForModel,
  buildProviderUrl,
  ProviderApiError,
} from "./index.ts";

describe("Milestone M11 — Provider Streaming, SIGTERM & Block Assembly", () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  beforeEach(async () => {
    server = http.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("streamProvider streams tokens in chronological order from mock SSE server", async () => {
    server.on("request", (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      res.write(
        "data: " + JSON.stringify({ choices: [{ delta: { content: "Hello " } }] }) + "\n\n",
      );
      res.write(
        "data: " + JSON.stringify({ choices: [{ delta: { content: "world! " } }] }) + "\n\n",
      );
      res.write(
        "data: " +
          JSON.stringify({ choices: [{ delta: { content: "Streaming works." } }] }) +
          "\n\n",
      );
      res.write("data: [DONE]\n\n");
      res.end();
    });

    const tokens: string[] = [];
    const stream = streamProvider({
      modelId: "gpt-5.6-sol",
      baseUrl,
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "token") {
        tokens.push(chunk.content);
      }
    }

    expect(tokens).toEqual(["Hello ", "world! ", "Streaming works."]);
  });

  it("cancels reader cleanly when signal.abort() is triggered mid-stream", async () => {
    const controller = new AbortController();

    server.on("request", (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      res.write(
        "data: " + JSON.stringify({ choices: [{ delta: { content: "Token 1" } }] }) + "\n\n",
      );
      // Delayed tokens that should not be received
      setTimeout(() => {
        try {
          res.write(
            "data: " + JSON.stringify({ choices: [{ delta: { content: "Token 2" } }] }) + "\n\n",
          );
          res.end();
        } catch {
          // stream closed
        }
      }, 100);
    });

    const tokens: string[] = [];
    const stream = streamProvider({
      modelId: "gpt-5.6-sol",
      baseUrl,
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === "token") {
        tokens.push(chunk.content);
        // Abort right after first token
        controller.abort("User cancelled");
      }
    }

    expect(tokens).toEqual(["Token 1"]);
  });

  it("extracts structured error details with retryable flag on non-2xx responses", async () => {
    server.on("request", (req, res) => {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "rate_limit_exceeded",
            message: "Too many concurrent requests. Please slow down.",
          },
        }),
      );
    });

    const stream = streamProvider({
      modelId: "sonnet-5",
      baseUrl,
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
    });

    await expect(async () => {
      for await (const _ of stream) {
        // drain
      }
    }).rejects.toThrow(ProviderApiError);

    try {
      const failingStream = streamProvider({
        modelId: "sonnet-5",
        baseUrl,
        apiKey: "test-key",
        messages: [{ role: "user", content: "hi" }],
      });
      for await (const _ of failingStream) {
        // drain
      }
    } catch (e: any) {
      expect(e).toBeInstanceOf(ProviderApiError);
      expect(e.details.status).toBe(429);
      expect(e.details.retryable).toBe(true);
      expect(e.details.code).toBe("rate_limit_exceeded");
      expect(e.details.message).toContain("Too many concurrent requests");
    }
  });

  it("BlockAssembler correctly reassembles tool calls split across 5 fragmented chunks", () => {
    const assembler = new BlockAssembler();
    const callId = "call-frag-1";

    const chunks = [
      { name: "write_file", argsDelta: '{"path": ' },
      { argsDelta: '"src/App' },
      { argsDelta: '.tsx", "content": ' },
      { argsDelta: '"export default function App() { ' },
      { argsDelta: 'return null; }"}' },
    ];

    let completedCall = null;
    for (const chunk of chunks) {
      const res = assembler.appendDelta(callId, chunk);
      if (res) {
        completedCall = res;
      }
    }

    expect(completedCall).toBeDefined();
    expect(completedCall?.id).toBe("call-frag-1");
    expect(completedCall?.name).toBe("write_file");
    expect(completedCall?.args).toEqual({
      path: "src/App.tsx",
      content: "export default function App() { return null; }",
    });
  });

  it("verifies per-model routing logic for responses, messages, and gemini endpoints", () => {
    expect(endpointForModel("gpt-5.6-sol")).toBe("responses");
    expect(endpointForModel("grok-3")).toBe("responses");
    expect(endpointForModel("claude-3-7-sonnet")).toBe("messages");
    expect(endpointForModel("minimax-text")).toBe("messages");
    expect(endpointForModel("gemini-2.5-flash")).toBe("gemini");

    expect(buildProviderUrl("https://api.openai.com/v1", "gpt-5.6-sol")).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(buildProviderUrl("https://api.anthropic.com/v1", "claude-3-7-sonnet")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(
      buildProviderUrl("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash"),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
    );
  });
});
