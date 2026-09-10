// FILE: secrets.test.ts
// Purpose: Provider secrets store (0600 file, merge semantics, settings
// view) + connection probes against loopback fakes.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderSecretsStore, isEncryptedSecretsFile } from "./secrets.ts";
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
    expect(view.providers.find((p) => p.id === "openai")).toEqual({
      id: "openai",
      configured: false,
      hasBaseUrl: true,
      keyless: false,
    });
    // Registry-wide listing: stored or not, every provider appears.
    expect(view.providers.length).toBeGreaterThan(10);
    expect(view.providers.find((p) => p.id === "ollama")).toMatchObject({ keyless: true });
    expect(JSON.stringify(view)).not.toContain("sk-a");
  });

  it("round-trips image-generation defaults (P8)", () => {
    const store = new ProviderSecretsStore(tempFile());
    store.setDefaults(undefined, undefined, "gemini", "gemini-2.0-flash-preview-image-generation");
    const view = store.publicView();
    expect(view.defaultImageProviderId).toBe("gemini");
    expect(view.defaultImageModelId).toBe("gemini-2.0-flash-preview-image-generation");
    // Empty string clears back to Auto without touching chat defaults.
    store.setDefaults(undefined, undefined, "", "");
    const cleared = store.publicView();
    expect(cleared.defaultImageProviderId).toBeUndefined();
    expect(cleared.defaultImageModelId).toBeUndefined();
    expect(cleared.defaultProviderId).toBeUndefined();
  });

  it("treats env-var keys as configured (mirrors turn resolution)", () => {
    const file = tempFile();
    const store = new ProviderSecretsStore(file);
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-env";
    try {
      const view = store.publicView();
      expect(view.providers.find((p) => p.id === "openai")).toMatchObject({ configured: true });
      expect(view.providers.find((p) => p.id === "anthropic")).toMatchObject({ configured: false });
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
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

  it("encrypts at rest, migrates v1 plaintext, and survives restarts", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-secenc-"));
    const file = path.join(dir, "providers.json");
    const store = new ProviderSecretsStore(file);
    store.setProvider("openai", { apiKey: "sk-secret" });
    expect(isEncryptedSecretsFile(file)).toBe(true);
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain("sk-secret");
    // Fresh instance (new process) decrypts with the key file.
    const reopened = new ProviderSecretsStore(file);
    expect(reopened.read().providers.openai).toMatchObject({ apiKey: "sk-secret" });
    // Key file is user-only.
    const stat = fs.statSync(path.join(dir, ".providers.key"));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("reads legacy v1 plaintext and migrates it on write", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-secmig-"));
    const file = path.join(dir, "providers.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, providers: { anthropic: { apiKey: "sk-old" } } }),
    );
    expect(isEncryptedSecretsFile(file)).toBe(false);
    const store = new ProviderSecretsStore(file);
    expect(store.read().providers.anthropic).toMatchObject({ apiKey: "sk-old" });
    store.setProvider("openai", { apiKey: "sk-new" });
    expect(isEncryptedSecretsFile(file)).toBe(true);
    const reread = new ProviderSecretsStore(file).read();
    expect(reread.providers.anthropic).toMatchObject({ apiKey: "sk-old" });
    expect(reread.providers.openai).toMatchObject({ apiKey: "sk-new" });
  });

  it("reads corrupt files as empty without throwing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-secbad-"));
    const file = path.join(dir, "providers.json");
    fs.writeFileSync(file, "{not json");
    expect(new ProviderSecretsStore(file).read()).toEqual({ version: 1, providers: {} });
    expect(isEncryptedSecretsFile(file)).toBe(false);
  });

  it("never mints keys on read: missing or wrong-size keys read empty", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-secnokey-"));
    const file = path.join(dir, "providers.json");
    // v2 envelope with no key file present.
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 2, encrypted: { iv: "x", tag: "y", data: "z" } }),
    );
    expect(new ProviderSecretsStore(file).read()).toEqual({ version: 1, providers: {} });
    expect(fs.existsSync(path.join(dir, ".providers.key"))).toBe(false);

    // Wrong-size key file is left untouched by reads.
    fs.writeFileSync(path.join(dir, ".providers.key"), Buffer.from([1, 2, 3]));
    expect(new ProviderSecretsStore(file).read()).toEqual({ version: 1, providers: {} });
    expect(fs.readFileSync(path.join(dir, ".providers.key"))).toEqual(Buffer.from([1, 2, 3]));
  });
});
