// FILE: src/testing/fakeLlmServer.test.ts
// Purpose: Unit tests for the ported fake-LLM server: wire protocol (SSE
// chunks), tc= fixture routing, [429], [increment], [high-tokens], [dump],
// tool-call streaming.
// Layer: Engine test infra

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANNED_MESSAGE,
  createStreamChunk,
  startFakeLlmServer,
  type FakeLlmServerHandle,
} from "./fakeLlmServer.ts";

let server: FakeLlmServerHandle;
let dumpDir: string;

beforeAll(async () => {
  dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), "synara-llm-test-"));
  server = await startFakeLlmServer({ dumpDir });
}, 10_000);

afterAll(async () => {
  await server.close();
  fs.rmSync(dumpDir, { recursive: true, force: true });
});

async function chatCompletions(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; contentType: string }> {
  const response = await fetch(`${server.url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text: await response.text(),
  };
}

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .filter((payload) => payload !== "[DONE]")
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

describe("fake LLM server", () => {
  it("serves /health", async () => {
    const response = await fetch(`${server.url}/health`);
    expect(response.status).toBe(200);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${server.url}/nope`);
    expect(response.status).toBe(404);
  });

  it("rejects invalid API keys with 401", async () => {
    const { status } = await chatCompletions(
      { messages: [{ role: "user", content: "hi" }] },
      { authorization: "Bearer invalid-key" },
    );
    expect(status).toBe(401);
  });

  it("simulates 429 rate limits for [429] prompts", async () => {
    const { status } = await chatCompletions({
      messages: [{ role: "user", content: "[429]" }],
    });
    expect(status).toBe(429);
  });

  it("streams the canned message as OpenAI-compatible SSE chunks", async () => {
    const { status, contentType, text } = await chatCompletions({
      messages: [{ role: "user", content: "Say something" }],
      stream: true,
    });
    expect(status).toBe(200);
    expect(contentType).toContain("text/event-stream");

    const chunks = parseSse(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe("stop");
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);

    const body = chunks.map((chunk) => chunk.choices[0].delta.content).join("");
    expect(body).toContain(CANNED_MESSAGE);
  });

  it("serves tc=<name> fixtures verbatim", async () => {
    const { text } = await chatCompletions({
      messages: [{ role: "user", content: "tc=build-plan" }],
      stream: true,
    });
    const chunks = parseSse(text);
    const body = chunks.map((chunk) => chunk.choices[0].delta.content).join("");
    expect(body).toContain("hello world Flutter app");
    expect(body).toContain("flutter create");
  });

  it("reports missing fixtures as an inline error, not a crash", async () => {
    const { text } = await chatCompletions({
      messages: [{ role: "user", content: "tc=does-not-exist" }],
      stream: true,
    });
    const chunks = parseSse(text);
    const body = chunks.map((chunk) => chunk.choices[0].delta.content).join("");
    expect(body).toContain("Test case file not found");
  });

  it("keeps a monotonic counter for [increment] prompts", async () => {
    const first = await chatCompletions({
      messages: [{ role: "user", content: "[increment]" }],
      stream: false,
    });
    const second = await chatCompletions({
      messages: [{ role: "user", content: "[increment]" }],
      stream: false,
    });
    expect(JSON.parse(first.text).choices[0].message.content).toMatch(/counter=\d+/);
    const counterFirst = parseInt(
      JSON.parse(first.text).choices[0].message.content.split("=")[1],
      10,
    );
    const counterSecond = parseInt(
      JSON.parse(second.text).choices[0].message.content.split("=")[1],
      10,
    );
    expect(counterSecond).toBe(counterFirst + 1);
  });

  it("includes usage in the final chunk for [high-tokens=N]", async () => {
    const { text } = await chatCompletions({
      messages: [{ role: "user", content: "[high-tokens=1234]" }],
      stream: true,
    });
    const chunks = parseSse(text);
    const last = chunks[chunks.length - 1];
    expect(last.usage).toMatchObject({ total_tokens: 1234 });
  });

  it("streams tool calls for [call_tool=name] prompts", async () => {
    const { text } = await chatCompletions({
      messages: [{ role: "user", content: "[call_tool=flutter_analyze]" }],
      stream: true,
    });
    const chunks = parseSse(text);
    const toolCallChunks = chunks.filter((chunk) => chunk.choices[0].delta.tool_calls);
    expect(toolCallChunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe("tool_calls");
  });

  it("writes [dump] request bodies to the dump dir and embeds the path", async () => {
    const { text } = await chatCompletions({
      messages: [{ role: "user", content: "[dump]" }],
      stream: true,
      model: "some-model",
    });
    const chunks = parseSse(text);
    const body = chunks.map((chunk) => chunk.choices[0].delta.content).join("");
    const match = body.match(/\[\[engine-dump-path=([^\]]+)\]\]/);
    expect(match).not.toBeNull();
    const dumpPath = match![1];
    expect(fs.existsSync(dumpPath)).toBe(true);
    const dumped = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    expect(dumped.body.model).toBe("some-model");
    expect(dumped.body.messages[0].content).toBe("[dump]");
  });

  it("lists a fake model at /v1/models", async () => {
    const response = await fetch(`${server.url}/v1/models`);
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { data: Array<{ id: string }> };
    expect(parsed.data[0].id).toBe("engine-fake-model");
  });

  it("createStreamChunk emits a [DONE] marker only on the final chunk", () => {
    const first = createStreamChunk("hello");
    expect(first.endsWith("data: [DONE]\n\n")).toBe(false);
    const last = createStreamChunk("", "assistant", true, { total_tokens: 5 });
    expect(last.endsWith("data: [DONE]\n\n")).toBe(true);
    const jsonLine = last.split("\n\n")[0].slice(6);
    expect(JSON.parse(jsonLine).usage.total_tokens).toBe(5);
  });
});
