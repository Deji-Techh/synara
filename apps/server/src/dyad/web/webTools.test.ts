// FILE: webTools.test.ts
// Purpose: M2b gate — fetch/extraction, search provider seam, image saver,
// workspace search, symbol lookup, explorer digest. Network-free except a
// local loopback server for fetch.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  executeExploreCode,
  executeGetMcpToolSchema,
  lookupSymbol,
  searchWorkspace,
  setExplorerRunner,
} from "./codeSearch.ts";
import { executeGenerateImage, setImageProvider } from "./generateImage.ts";
import { executeWebSearch, setWebSearchProvider } from "./webSearch.ts";
import { fetchPage, htmlToText } from "./webFetch.ts";

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(15_000),
    appPath,
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-web-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "auth.ts"),
    "export function signIn(email: string) {\n  return authenticateUser(email);\n}\n\nexport class AuthSession {}\n",
  );
  fs.writeFileSync(path.join(dir, "src", "index.ts"), "import { signIn } from './auth';\nconsole.log(signIn);\n");
  return dir;
}

let server: http.Server;
let base = "";
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/doc") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><title>Docs</title></head><body><nav>menu</nav><script>var x=1;</script><h1>Guide</h1><p>Hello world</p></body></html>");
    } else if (req.url === "/text") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("plain body");
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("dyad web backends transplant (m2b)", () => {
  it("extracts readable text and fetches locally", async () => {
    const { title, text } = htmlToText("<title>T</title><script>bad()</script><p>Keep <b>this</b></p>");
    expect(title).toBe("T");
    expect(text).toContain("Keep this");
    expect(text).not.toContain("bad()");

    const page = await fetchPage(`${base}/doc`);
    expect(page.title).toBe("Docs");
    expect(page.text).toContain("Guide");
    expect(page.text).not.toContain("menu");

    const plain = await fetchPage(`${base}/text`);
    expect(plain.text).toBe("plain body");
    await expect(fetchPage(`${base}/missing`)).rejects.toThrow(/404/);
    await expect(fetchPage("ftp://x")).rejects.toThrow(/http\(s\)/);
  });

  it("searches through the injected provider, degrading gracefully", async () => {
    setWebSearchProvider(async () => [{ title: "Expo docs", url: "https://docs.expo.dev", snippet: "router" }]);
    try {
      const out = await executeWebSearch("expo router");
      expect(out).toContain("Expo docs");
    } finally {
      setWebSearchProvider(null);
    }
    setWebSearchProvider(async () => []);
    try {
      await expect(executeWebSearch("zzz")).resolves.toMatch(/No results/);
    } finally {
      setWebSearchProvider(null);
    }
  });

  it("saves generated images under .caide/media via the injected provider", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-web-"));
    setImageProvider(async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }));
    try {
      const out = await executeGenerateImage(
        { prompt: "a red circle", width: 512, height: 512, filename: undefined },
        dir,
      );
      expect(out).toContain(".caide/media/generated-image-");
      expect(out).toContain("copy_file");
      const files = fs.readdirSync(path.join(dir, ".caide", "media"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.png$/);
    } finally {
      setImageProvider(null);
    }
  });

  it("searches workspace code, locates symbols, and digests explorations", async () => {
    const dir = workspace();
    const hits = await searchWorkspace(dir, "authenticateUser");
    expect(hits[0].path).toBe(path.join("src", "auth.ts"));

    const defs = await lookupSymbol(dir, "signIn");
    expect(defs[0]).toMatchObject({ path: path.join("src", "auth.ts"), line: 1, kind: "definition" });
    const cls = await lookupSymbol(dir, "AuthSession");
    expect(cls[0].kind).toBe("definition");
    expect(await lookupSymbol(dir, "nope-missing")).toEqual([]);

    const digest = await executeExploreCode({ intent: "locate", target: "signIn" }, dir);
    expect(digest).toContain("Codebase map");
    expect(digest).toContain("M3");

    setExplorerRunner(async () => "SYNTHESIZED MAP");
    try {
      await expect(
        executeExploreCode({ intent: "explain", target: "signIn" }, dir),
      ).resolves.toBe("SYNTHESIZED MAP");
    } finally {
      setExplorerRunner(null);
    }
  });
});
