import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import {
  streamProvider,
  BlockAssembler,
  LLMStreamTiming,
  endpointForModel,
  buildProviderUrl,
  ProviderApiError,
  extractStreamUsage,
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

  it("sends x-opencode-session + opencode User-Agent on OpenCode endpoints only", async () => {
    const { isOpenCodeEndpoint, openCodeHeaders } = await import("./apiAdapter.ts");
    expect(isOpenCodeEndpoint("https://opencode.ai/zen/v1")).toBe(true);
    expect(isOpenCodeEndpoint("https://opencode.ai/zen/go/v1")).toBe(true);
    expect(isOpenCodeEndpoint("https://api.openai.com/v1")).toBe(false);

    const headers = openCodeHeaders("session-abc");
    expect(headers["x-opencode-session"]).toBe("session-abc");
    expect(headers["User-Agent"]).toMatch(/^opencode\//);
    expect(headers["x-opencode-client"]).toBe("caide");
    expect(headers["x-opencode-request"]).toBeTruthy();
    // fallback generates an id when no session is passed
    expect(openCodeHeaders()["x-opencode-session"]).toBeTruthy();

    // Non-OpenCode endpoints must not carry the headers on the wire.
    let seen: Record<string, string | string[] | undefined> = {};
    server.on("request", (req, res) => {
      seen = req.headers as Record<string, string | string[] | undefined>;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: [DONE]\n\n");
      res.end();
    });
    const stream = streamProvider({
      modelId: "mimo-v2.5-free",
      baseUrl,
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
      sessionId: "session-abc",
    });
    for await (const _ of stream) {
      // drain
    }
    expect(seen["x-opencode-session"]).toBeUndefined();
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    );
  });

  it("strips Gemini-rejected schema keys from function_declarations in the request body", async () => {
    let body: any = null;
    server.on("request", (req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        body = JSON.parse(raw);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(
          "data: " +
            JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }) +
            "\n\n",
        );
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });

    const tools = [
      {
        name: "read_file",
        description: "Read a file",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            limit: { type: "number", exclusiveMinimum: 0 },
            filter: {
              type: "object",
              properties: { q: { type: "string" } },
              additionalProperties: false,
            },
          },
        },
      },
    ];
    const tokens: string[] = [];
    const stream = streamProvider({
      modelId: "gemini-2.5-flash",
      baseUrl,
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
      tools,
    });
    for await (const chunk of stream) {
      if (chunk.type === "token") tokens.push(chunk.content);
    }
    expect(tokens).toEqual(["hi"]);
    const decls = body.tools[0].function_declarations;
    expect(JSON.stringify(decls)).not.toContain("additionalProperties");
    expect(JSON.stringify(decls)).not.toContain("exclusiveMinimum");
    // Untouched shape otherwise.
    expect(decls[0].name).toBe("read_file");
    expect(decls[0].parameters.properties.path).toEqual({ type: "string" });
    expect(decls[0].parameters.properties.limit).toEqual({ type: "number" });
    expect(decls[0].parameters.properties.filter.properties.q).toEqual({ type: "string" });
  });
});

describe("stream usage extraction (per dialect)", () => {
  it("reads Anthropic message_start/message_delta usage", () => {
    expect(
      extractStreamUsage({
        type: "message_start",
        message: { usage: { input_tokens: 120, output_tokens: 0 } },
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 0 });
    expect(extractStreamUsage({ type: "message_delta", usage: { output_tokens: 33 } })).toEqual({
      inputTokens: 0,
      outputTokens: 33,
    });
  });

  it("reads OpenAI responses + chat/completions usage", () => {
    expect(
      extractStreamUsage({
        type: "response.completed",
        response: { usage: { input_tokens: 10, output_tokens: 20 } },
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(extractStreamUsage({ usage: { prompt_tokens: 5, completion_tokens: 7 } })).toEqual({
      inputTokens: 5,
      outputTokens: 7,
    });
  });

  it("reads Gemini usageMetadata and ignores the rest", () => {
    expect(
      extractStreamUsage({ usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 9 } }),
    ).toEqual({ inputTokens: 8, outputTokens: 9 });
    expect(extractStreamUsage({ type: "content_block_delta" })).toBeNull();
    expect(extractStreamUsage(null)).toBeNull();
    expect(extractStreamUsage({ usage: {} })).toBeNull();
  });
});
