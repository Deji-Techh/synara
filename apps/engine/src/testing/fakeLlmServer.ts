// FILE: src/testing/fakeLlmServer.ts
// Purpose: In-process fake LLM server for the engine vitest harness. Speaks the
// OpenAI chat-completions wire protocol (SSE streaming) so the REAL agent-loop
// HTTP client (AI SDK openai-compatible provider) talks to it unmodified.
// Ported from dyad x caide's testing/fake-llm-server (chat completions route),
// trimmed to the engine's needs and rewritten on plain node:http (no express).
// Layer: Engine test infra

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import fs from "node:fs";
import path from "node:path";

export const CANNED_MESSAGE = "hello world from the caide engine fake LLM";

export interface StreamUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Builds an OpenAI-compatible SSE data chunk. `isLast` emits the [DONE] marker
 * and optionally a usage payload (same shape the real OpenAI API sends when
 * `stream_options.include_usage` is requested).
 */
export function createStreamChunk(
  content: string,
  role: string = "assistant",
  isLast: boolean = false,
  usage?: Partial<StreamUsage>,
) {
  const chunk: Record<string, unknown> = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "engine-fake-model",
    choices: [
      {
        index: 0,
        delta: isLast ? {} : { content, role },
        finish_reason: isLast ? "stop" : null,
      },
    ],
  };
  if (isLast && usage) {
    chunk.usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      ...usage,
    };
  }
  return `data: ${JSON.stringify(chunk)}\n\n${isLast ? "data: [DONE]\n\n" : ""}`;
}
function streamToolCalls(
  res: ServerResponse,
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): void {
  const now = Date.now();
  const mkChunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({
      id: `chatcmpl-${now}`,
      object: "chat.completion.chunk",
      created: Math.floor(now / 1000),
      model: "engine-fake-model",
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  res.write(mkChunk({ role: "assistant" }));
  res.write(
    mkChunk({
      tool_calls: calls.map((call, index) => ({
        index,
        id: `call_${now}_${index}`,
        type: "function",
        function: { name: call.name, arguments: "" },
      })),
    }),
  );
  for (const [callIndex, call] of calls.entries()) {
    const argsText = JSON.stringify(call.args);
    const batchSize = 20;
    for (let offset = 0; offset < argsText.length; offset += batchSize) {
      res.write(
        mkChunk({
          tool_calls: [
            {
              index: callIndex,
              function: { arguments: argsText.slice(offset, offset + batchSize) },
            },
          ],
        }),
      );
    }
  }
  res.write(mkChunk({}, "tool_calls"));
  res.write("data: [DONE]\n\n");
  res.end();
}

let globalCounter = 0;

function generateDump(reqBody: unknown, dumpDir: string): string {
  fs.mkdirSync(dumpDir, { recursive: true });
  const dumpFilePath = path.join(
    dumpDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  fs.writeFileSync(
    dumpFilePath,
    JSON.stringify({ body: reqBody }, null, 2).replace(/\r\n/g, "\n"),
    "utf-8",
  );
  return `[[engine-dump-path=${dumpFilePath}]]`;
}

function getTextContent(message: { content: unknown }): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    const textPart = message.content.find(
      (part: unknown) =>
        typeof part === "object" && part !== null && (part as { type?: string }).type === "text",
    );
    return textPart ? String((textPart as { text?: unknown }).text ?? "") : "";
  }
  return "";
}

let cachedFixturesDir: string | undefined;

/**
 * Fixtures directory (served via the `tc=<name>` protocol). The harness sets
 * FAKE_LLM_FIXTURES_DIR; otherwise walk up from this file looking for
 * `<repoRoot>/apps/engine/fixtures` (works from src and dist layouts).
 */
export function resolveFixturesDir(): string {
  if (process.env.FAKE_LLM_FIXTURES_DIR) {
    return process.env.FAKE_LLM_FIXTURES_DIR;
  }
  if (cachedFixturesDir) {
    return cachedFixturesDir;
  }
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "apps", "engine", "fixtures");
    if (fs.existsSync(candidate)) {
      cachedFixturesDir = candidate;
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path.join(__dirname, "fixtures");
}

export interface FakeChatCompletionRequestBody {
  stream?: boolean;
  model?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  stream_options?: { include_usage?: boolean };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length === 0 ? {} : JSON.parse(raw);
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function createChatCompletionHandler(fixturesDir: string, dumpDir: string, quiet: boolean) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    body: FakeChatCompletionRequestBody,
  ): Promise<void> => {
    const log = (message: string) => {
      if (!quiet) {
        console.log(`[fake-llm] ${message}`);
      }
    };
    const { stream = false, messages = [] } = body;

    const authorization = req.headers.authorization;
    if (typeof authorization === "string" && /invalid/i.test(authorization)) {
      respondJson(res, 401, {
        error: {
          message: "Invalid API key",
          type: "authentication_error",
          param: null,
          code: "invalid_api_key",
        },
      });
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && getTextContent(lastMessage) === "[429]") {
      respondJson(res, 429, {
        error: {
          message: "Too many requests. Please try again later.",
          type: "rate_limit_error",
          param: null,
          code: "rate_limit_exceeded",
        },
      });
      return;
    }

    // Once a tool result has been fed back (role: "tool"), stop re-triggering
    // the tool call and answer with the canned message — the multi-step loop
    // terminates like a real model would.
    const toolResultAlreadyFedBack = messages.some((m) => m.role === "tool");

    let messageContent = CANNED_MESSAGE;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUserMessage ? getTextContent(lastUserMessage) : "";

    // When a tool result has been fed back, the model's answer flows from it:
    // echo the last tool-result content so tests can assert the tool output
    // actually reached the model.
    if (toolResultAlreadyFedBack) {
      const toolMessages = messages.filter((m) => m.role === "tool");
      const lastToolMessage = toolMessages[toolMessages.length - 1];
      const toolContent = lastToolMessage ? getTextContent(lastToolMessage) : "";
      if (toolContent !== "") {
        messageContent += `\n[fake-llm] tool result seen by model:\n${toolContent}`;
      }
    }

    if (userText.startsWith("tc=") && !userText.startsWith("tc=local-agent/")) {
      const testCaseName = userText.slice(3).split("[")[0].trim();
      log(`loading test case: ${testCaseName}`);
      const testFilePath = path.join(fixturesDir, `${testCaseName}.md`);
      if (fs.existsSync(testFilePath)) {
        messageContent = fs.readFileSync(testFilePath, "utf-8").replace(/\r\n/g, "\n");
      } else {
        messageContent = `Error: Test case file not found: ${testCaseName}.md`;
      }
    }

    if (userText === "[increment]") {
      globalCounter++;
      messageContent = `counter=${globalCounter}`;
    }

    const isToolCall = userText.includes("[call_tool=");
    const toolCallMatches = [
      ...userText.matchAll(/\[call_tool=([a-zA-Z0-9_]+)(?::((?:[^\[\]]*)))?\]/g),
    ];

    const toolCallArgs = (argsJson: string | undefined): Record<string, unknown> => {
      // [call_tool=write_file:{"path":"lib/main.dart","content":"..."}] passes
      // explicit JSON args; bare [call_tool=name] falls back to {request: ...}.
      if (argsJson) {
        try {
          const parsed = JSON.parse(argsJson) as unknown;
          if (parsed && typeof parsed === "object") {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // fall through to the default args
        }
      }
      return { request: userText };
    };
    const toolCalls = toolCallMatches.map((match) => ({
      name: match[1]!,
      args: toolCallArgs(match[2]),
    }));

    const highTokensMatch =
      typeof lastMessage?.content === "string" &&
      lastMessage.content.match(/\[high-tokens=(\d+)\]/);
    const highTokensValue = highTokensMatch ? parseInt(highTokensMatch[1], 10) : null;

    const includeUsage = body.stream_options?.include_usage === true || highTokensValue !== null;
    const usage: Partial<StreamUsage> | undefined = highTokensValue
      ? {
          prompt_tokens: highTokensValue - 100,
          completion_tokens: 100,
          total_tokens: highTokensValue,
        }
      : includeUsage || stream
        ? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        : undefined;

    const requestDump = (): void => {
      const marker = generateDump(body, dumpDir);
      messageContent += `\n[[dump-marker]]${marker}`;
    };

    if (isToolCall && toolCalls.length > 0 && !toolResultAlreadyFedBack && !stream) {
      respondJson(res, 200, {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "engine-fake-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: toolCalls.map((call, index) => ({
                id: `call_${Date.now()}_${index}`,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              })),
            },
            finish_reason: "tool_calls",
          },
        ],
      });
      return;
    }

    if (isToolCall && toolCalls.length > 0 && !toolResultAlreadyFedBack) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      streamToolCalls(res, toolCalls);
      return;
    }

    if (!stream) {
      respondJson(res, 200, {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "engine-fake-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: messageContent },
            finish_reason: "stop",
          },
        ],
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (userText.includes("[dump]")) {
      requestDump();
    }

    res.write(createStreamChunk("", "assistant"));
    const messageChars = messageContent.split("");
    let index = 0;
    const batchSize = 32;
    const interval = setInterval(() => {
      if (index < messageChars.length) {
        const batch = messageChars.slice(index, index + batchSize).join("");
        res.write(createStreamChunk(batch));
        index += batchSize;
      } else {
        res.write(createStreamChunk("", "assistant", true, usage));
        clearInterval(interval);
        res.end();
      }
    }, 5);
  };
}

export interface FakeLlmServerHandle {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface StartFakeLlmServerOptions {
  port?: number;
  host?: string;
  fixturesDir?: string;
  dumpDir?: string;
  quiet?: boolean;
}

/**
 * Starts the fake-LLM server on `port` (default 0 = ephemeral). In-process and
 * parallel-safe: the harness passes a unique dump dir per test.
 */
export function startFakeLlmServer(
  options: StartFakeLlmServerOptions = {},
): Promise<FakeLlmServerHandle> {
  const { port = 0, host = "127.0.0.1" } = options;
  const fixturesDir = options.fixturesDir ?? resolveFixturesDir();
  const dumpDir = options.dumpDir ?? path.join(__dirname, "..", "..", ".fake-llm-dumps");
  const quiet = options.quiet ?? true;

  const chatHandler = createChatCompletionHandler(fixturesDir, dumpDir, quiet);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      respondJson(res, 200, { status: "ok" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      void readJsonBody(req)
        .then((parsed) => chatHandler(req, res, parsed as FakeChatCompletionRequestBody))
        .catch((error) => {
          respondJson(res, 400, {
            error: { message: String(error), type: "invalid_request_error" },
          });
        });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/models") {
      respondJson(res, 200, {
        object: "list",
        data: [{ id: "engine-fake-model", object: "model", owned_by: "engine" }],
      });
      return;
    }
    respondJson(res, 404, {
      error: { message: `no fake route: ${req.method} ${url.pathname}`, type: "not_found" },
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const boundPort = (server.address() as AddressInfo).port;
      resolve({
        server,
        port: boundPort,
        url: `http://${host}:${boundPort}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
