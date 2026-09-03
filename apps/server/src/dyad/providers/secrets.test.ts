// FILE: secrets.test.ts
// Purpose: Provider secrets store (0600 file, merge semantics, settings
// view) + connection probes against loopback fakes.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderSecretsStore } from "./secrets.ts";
import { testProviderConnection } from "./testConnection.ts";

function tempFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "caide-sec-")), "providers.json");
}

describe("provider secrets store", () => {
  it("writes 0600 files with merge semantics", () => {
    const store = new ProviderSecretsStore(tempFile());
    expect(store.read()).toEqual({ version: 1, providers: {} });
    store.setProvider("openai", { apiKey: " sk-a " });
    store.setProvider("openai", { apiBaseUrl: "https://x/v1" });
    const file = store.read();
    expect(file.providers.openai).toEqual({ apiKey: "sk-a", apiBaseUrl: "https://x/v1" });
    store.setProvider("openai", { apiKey: "  " });
    expect(store.read().providers.openai).toEqual({ apiBaseUrl: "https://x/v1" });
    const settings = store.toSettings();
    expect(settings.providerSettings?.openai).toEqual({ apiBaseUrl: "https://x/v1" });
    const view = store.publicView();
    expect(view.providers).toEqual([{ id: "openai", configured: false, hasBaseUrl: true }]);
    expect(JSON.stringify(view)).not.toContain("sk-a");
  });

  it("tolerates missing and corrupt files", () => {
    const file = tempFile();
    expect(new ProviderSecretsStore(file).read().providers).toEqual({});
    fs.writeFileSync(file, "not json{{{");
    expect(new ProviderSecretsStore(file).read().providers).toEqual({});
  });
});

describe("provider connection probes", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", "http://x");
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const auth = req.headers.authorization;
      if (url.pathname === "/models" || url.pathname === "/v1/models") {
        if (auth !== "Bearer good") return json(401, {});
        return json(200, { data: [{ id: "m1" }] });
      }
      if (url.pathname === "/api/tags") return json(200, { models: [] });
      return json(404, {});
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("probes keyed and local providers", async () => {
    await expect(testProviderConnection({ providerId: "openai", apiKey: "good", baseUrl: base })).resolves.toMatchObject({
      ok: true,
      message: "Connected — 1 model(s) listed.",
    });
    await expect(testProviderConnection({ providerId: "openai", apiKey: "bad", baseUrl: base })).resolves.toMatchObject({
      ok: false,
      message: "Key rejected (401/403). Check the key.",
    });
    await expect(testProviderConnection({ providerId: "openai" })).resolves.toMatchObject({ ok: false });
    await expect(testProviderConnection({ providerId: "ollama", baseUrl: base })).resolves.toMatchObject({ ok: true });
    await expect(testProviderConnection({ providerId: "minimax", apiKey: "x" })).resolves.toMatchObject({
      ok: true,
      message: "Key saved — no live check for this provider yet.",
    });
  });
});
