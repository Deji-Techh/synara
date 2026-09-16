// FILE: localModels.test.ts
// Purpose: 009 M6 gate — Ollama/LM Studio host parsing + live inventory
// against loopback fakes (donor response shapes).

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchLMStudioModels,
  fetchOllamaModels,
  getLmStudioBaseUrl,
  getOllamaApiUrl,
  parseOllamaHost,
} from "./localModels.ts";

describe("ollama host parsing (donor verbatim)", () => {
  it("handles missing, full URLs, host:port, hostnames, and IPv6", () => {
    expect(parseOllamaHost(undefined)).toBe("http://localhost:11434");
    expect(parseOllamaHost("https://h:1")).toBe("https://h:1");
    expect(parseOllamaHost("myhost:11434")).toBe("http://myhost:11434");
    expect(parseOllamaHost("myhost")).toBe("http://myhost:11434");
    expect(parseOllamaHost("[::1]:8080")).toBe("http://[::1]:8080");
    expect(parseOllamaHost("::1")).toBe("http://[::1]:11434");
  });

  it("prefers OLLAMA_HOST with OLLAMA_BASE_URL as alias", () => {
    const prevHost = process.env.OLLAMA_HOST;
    const prevBase = process.env.OLLAMA_BASE_URL;
    try {
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_BASE_URL;
      expect(getOllamaApiUrl()).toBe("http://localhost:11434");
      process.env.OLLAMA_BASE_URL = "http://alias:1";
      expect(getOllamaApiUrl()).toBe("http://alias:1");
      process.env.OLLAMA_HOST = "donor-host";
      expect(getOllamaApiUrl()).toBe("http://donor-host:11434");
      expect(getLmStudioBaseUrl()).toBe("http://localhost:1234");
    } finally {
      if (prevHost === undefined) delete process.env.OLLAMA_HOST;
      else process.env.OLLAMA_HOST = prevHost;
      if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = prevBase;
    }
  });
});

describe("local inventory against loopback fakes", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", "http://x");
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname.endsWith("/api/tags")) {
        if (url.pathname.startsWith("/empty/")) return json(200, { models: [] });
        if (url.pathname.startsWith("/fail/")) return json(500, {});
        return json(200, {
          models: [
            { name: "qwen2.5-coder:32b", digest: "x" },
            { name: "llama3.3" },
            { name: "" },
            {},
          ],
        });
      }
      if (url.pathname.endsWith("/api/v0/models")) {
        if (url.pathname.startsWith("/fail/")) return json(500, {});
        return json(200, {
          data: [
            { type: "llm", id: "model-a" },
            { type: "embedding", id: "embed-a" },
            { type: "llm", id: "" },
          ],
        });
      }
      return json(404, {});
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("lists ollama models with prettified display names", async () => {
    const { models } = await fetchOllamaModels(base);
    // Display prettify is donor-verbatim, quirks included (digit runs get
    // spaced: "Qwen 2 .5 Coder").
    expect(models).toEqual([
      { modelName: "qwen2.5-coder:32b", displayName: "Qwen 2 .5 Coder", provider: "ollama" },
      { modelName: "llama3.3", displayName: "Llama 3 .3", provider: "ollama" },
    ]);
  });

  it("fails structured on ollama errors and dead hosts", async () => {
    await expect(fetchOllamaModels(`${base}/fail`)).rejects.toThrow();
    await expect(fetchOllamaModels(`${base}/empty`)).resolves.toEqual({ models: [] });
    await expect(fetchOllamaModels("http://127.0.0.1:1")).rejects.toThrow(/Could not connect/);
  });

  it("lists lmstudio llm models only", async () => {
    const { models } = await fetchLMStudioModels(base);
    expect(models).toEqual([
      { modelName: "model-a", displayName: "model-a", provider: "lmstudio" },
    ]);
  });

  it("fails structured on lmstudio errors", async () => {
    await expect(fetchLMStudioModels(`${base}/fail`)).rejects.toThrow();
  });
});
