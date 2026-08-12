// FILE: src/preview/webServerPreview.integration.test.ts
// Purpose: Proves the M3b web-server preview service end to end: spawns the
// REAL startWebServerPreview against a fake `flutter` shim on PATH that prints
// the flutter web-server "is being served at" lines and then ACTUALLY serves
// HTTP (node static server) on the requested port. Asserts the parsed URL,
// a real fetch through it, log capture, and clean stop().
// Layer: Engine integration test
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startWebServerPreview, type WebServerPreview } from "./webServerPreview.ts";

const FLUTTER_SHIM = `#!/bin/sh
# Fake flutter: defers to serve.mjs, which prints the real flutter web-server
# serving lines only AFTER the HTTP server is listening (mirroring real
# flutter's order of operations).
exec node "$(dirname "$0")/serve.mjs" "$@"
`;

const SERVE_MJS = `import { createServer } from "node:http";
const args = process.argv.slice(2);
let port = 0;
let host = "127.0.0.1";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--web-port") { port = Number(args[i + 1]); i++; }
  if (args[i] === "--web-hostname") { host = args[i + 1]; i++; }
}
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<h1 id=\\"hello\\">hello world from fake flutter web server</h1>");
});
server.listen(port, host, () => {
  console.log("Launching lib/main.dart on web-server in debug mode...");
  console.log("lib/main.dart is being served at");
  console.log("http://" + host + ":" + server.address().port + "/");
  console.log("The web-server device requires the Dart Debug Extension...");
});
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (line === "q") {
      server.close(() => process.exit(0));
      return;
    }
    if (line === "r") {
      console.log("Performing hot reload...");
      console.log("Reloaded 1 of 1 libraries in 42ms.");
    } else if (line === "R") {
      console.log("Performing hot restart...");
    }
  }
});
`;

describe("web server preview", () => {
  let tempRoot: string;
  let appDir: string;
  let shimDir: string;
  let savedPath: string;
  let preview: WebServerPreview | null = null;

  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synara-preview-"));
    appDir = path.join(tempRoot, "app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "pubspec.yaml"), "name: hello_app\n", "utf8");
    shimDir = path.join(tempRoot, "shimbin");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(path.join(shimDir, "flutter"), FLUTTER_SHIM, { mode: 0o755 });
    fs.writeFileSync(path.join(shimDir, "serve.mjs"), SERVE_MJS, "utf8");
    savedPath = process.env.PATH ?? "";
    process.env.PATH = `${shimDir}${path.delimiter}${savedPath}`;
  }, 15_000);

  afterAll(async () => {
    await preview?.stop().catch(() => undefined);
    process.env.PATH = savedPath;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("starts, reports the served URL, and serves real HTTP", async () => {
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const port = (portProbe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));

    const logLines: string[] = [];
    preview = await startWebServerPreview({
      appDir,
      port,
      hostname: "127.0.0.1",
      onLogLine: (line) => logLines.push(line),
    });

    expect(preview.url).toBe(`http://127.0.0.1:${port}`);
    expect(preview.logs.join("\n")).toContain("is being served at");
    expect(logLines.join("\n")).toContain("Launching lib/main.dart");

    // Fetch through the served URL — a REAL HTTP round trip.
    const response = await fetch(`${preview.url}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("hello world from fake flutter web server");
  }, 30_000);

  it("reload() sends hot reload/restart to flutter stdin", async () => {
    expect(preview).not.toBeNull();
    expect(preview!.reload(true)).toBe(true);
    expect(preview!.reload(false)).toBe(true);
    // The shim prints flutter's real hot-reload lines in response.
    await vi.waitFor(() => {
      const logText = preview!.logs.join("\n");
      expect(logText).toContain("Performing hot reload");
      expect(logText).toContain("Reloaded 1 of 1 libraries");
      expect(logText).toContain("Performing hot restart");
    }, 5_000);
  }, 15_000);

  it("stop() terminates the flutter process", async () => {
    expect(preview).not.toBeNull();
    const exited = preview!.exited;
    await preview!.stop();
    await expect(exited).resolves.not.toBeNull();
    // Flutter is gone, so stdin reloads are refused.
    expect(preview!.reload(true)).toBe(false);
    preview = null;
  }, 15_000);

  it("rejects when flutter exits before serving", async () => {
    const badAppDir = path.join(tempRoot, "bad-app");
    fs.mkdirSync(badAppDir, { recursive: true });
    // A flutter that exits immediately (simulate a broken toolchain).
    fs.writeFileSync(
      path.join(shimDir, "flutter"),
      `#!/bin/sh\necho "no devices found" >&2\nexit 1\n`,
      { mode: 0o755 },
    );
    try {
      await expect(
        startWebServerPreview({ appDir: badAppDir, serveTimeoutMs: 10_000 }),
      ).rejects.toThrow(/exited with code 1 before serving/);
    } finally {
      fs.writeFileSync(path.join(shimDir, "flutter"), FLUTTER_SHIM, { mode: 0o755 });
    }
  }, 30_000);
});
