// FILE: keyedProviders.test.ts
// Purpose: C9/C11 gate — keyed search/image selection + provider shapes
// against loopback fakes; blockchain RPC tests + registry + tool.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { autoImageProvider, openaiImageProvider } from "./keyedImages.ts";
import { autoWebSearchProvider, braveProvider, tavilyProvider } from "./keyedSearch.ts";
import { setWebSearchProvider } from "./webSearch.ts";
import { setImageProvider } from "./generateImage.ts";
import {
  clearBlockchainNetworks,
  listBlockchainNetworks,
  setBlockchainNetworks,
  testEvmRpc,
  testRpcTool,
  testSolanaRpc,
} from "../web3/networks.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = "";
  req.on("data", (d: Buffer) => (body += d.toString()));
  req.on("end", () => {
    const url = new URL(req.url ?? "", "http://x");
    const json = (code: number, payload: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === "/search" && req.method === "POST") {
      return json(200, { results: [{ title: "T", url: "https://t.dev", content: "snippet here" }] });
    }
    if (url.pathname === "/res/v1/web/search") {
      return json(200, { web: { results: [{ title: "B", url: "https://b.dev", description: "desc here" }] } });
    }
    if (url.pathname === "/v1/images/generations") {
      return json(200, { data: [{ b64_json: Buffer.from([1, 2, 3]).toString("base64") }] });
    }
    if (url.pathname === "/evm") {
      const msg = JSON.parse(body) as { method: string };
      const result = msg.method === "eth_chainId" ? "0x1" : "0xabc";
      return json(200, { jsonrpc: "2.0", id: 1, result });
    }
    if (url.pathname === "/sol") {
      const msg = JSON.parse(body) as { method: string };
      const result = msg.method === "getVersion" ? { "solana-core": "2.0.0" } : 12345;
      return json(200, { jsonrpc: "2.0", id: 1, result });
    }
    return json(404, {});
  });
}

let server: http.Server;
let base = "";
beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

/** Redirect all fetches to the loopback server, preserving path+query. */
function redirectFetchToLoopback(): void {
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const rewritten = new URL(target);
    const loopback = new URL(base);
    rewritten.protocol = loopback.protocol;
    rewritten.host = loopback.host;
    return realFetch(rewritten.toString(), init);
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;
  setWebSearchProvider(null);
  setImageProvider(null);
  delete process.env.TAVILY_API_KEY;
  delete process.env.BRAVE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_IMAGE_API_KEY;
});

describe("keyed web providers + web3 rpc (c9/c11)", () => {
  it("selects Tavily over Brave over keyless, with working shapes", async () => {
    expect(autoWebSearchProvider()).toBeNull();
    process.env.BRAVE_API_KEY = "b";
    expect(autoWebSearchProvider()).not.toBeNull();
    process.env.TAVILY_API_KEY = "t";
    expect(autoWebSearchProvider()).not.toBeNull();

    redirectFetchToLoopback();
    await expect(tavilyProvider("t")("q")).resolves.toMatchObject([{ title: "T" }]);
    await expect(braveProvider("b")("q")).resolves.toMatchObject([{ title: "B" }]);
  });

  it("selects OpenAI images by env with working shape", async () => {
    expect(autoImageProvider()).toBeNull();
    process.env.OPENAI_API_KEY = "sk-x";
    expect(autoImageProvider()).not.toBeNull();
    redirectFetchToLoopback();
    const img = await openaiImageProvider("sk-x")({ prompt: "x", width: 512, height: 512 });
    expect(img.bytes.length).toBe(3);
    expect(img.mimeType).toBe("image/png");
  });

  it("tests EVM and Solana RPCs with donor shapes", async () => {
    await expect(testEvmRpc(`${base}/evm`)).resolves.toEqual({ chainId: "0x1", block: "0xabc" });
    await expect(testSolanaRpc(`${base}/sol`)).resolves.toEqual({ version: "2.0.0", height: 12345 });
    await expect(testEvmRpc("http://127.0.0.1:1/evm")).rejects.toThrow();
  });

  it("registers networks and runs the test_rpc tool", async () => {
    clearBlockchainNetworks();
    expect(
      await testRpcTool.execute(
        {},
        { signal: AbortSignal.timeout(10_000), appPath: "/tmp/x", sessionId: "s", toolId: "t" },
      ),
    ).toMatch(/No blockchain networks/);
    setBlockchainNetworks([
      { id: "e1", chainKind: "evm", chainId: "1", name: "Local EVM", rpcUrl: `${base}/evm`, isActive: true },
      { id: "s1", chainKind: "solana", chainId: "local", name: "Local Sol", rpcUrl: `${base}/sol`, isActive: true },
    ]);
    expect(listBlockchainNetworks()).toHaveLength(2);
    const out = (await testRpcTool.execute(
      {},
      { signal: AbortSignal.timeout(10_000), appPath: "/tmp/x", sessionId: "s", toolId: "t" },
    )) as string;
    expect(out).toContain("Local EVM: OK (chain 0x1, block 0xabc)");
    expect(out).toContain("Local Sol: OK (v2.0.0, slot 12345)");
    expect(testRpcTool.presentCall?.({})).toBe("Test all RPCs");
    clearBlockchainNetworks();
  });
});
