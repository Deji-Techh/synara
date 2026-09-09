// FILE: providerKeyPresence.test.ts
// Purpose: Covers local key-presence snapshots (v1 plaintext, v2 encrypted,
// missing files) without ever exposing key material.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readProviderKeyPresence } from "./providerKeyPresence";

let tmpDirs: string[] = [];

function makeHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-presence-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
  delete process.env.GROQ_API_KEY;
  vi.restoreAllMocks();
});

describe("readProviderKeyPresence", () => {
  it("reports nothing configured for a missing file", () => {
    const entries = readProviderKeyPresence(makeHome());
    expect(entries.find((e) => e.id === "groq")).toMatchObject({ configured: false });
    expect(entries.find((e) => e.id === "google")).toMatchObject({ configured: false });
    expect(entries.every((e) => typeof e.id === "string")).toBe(true);
    // Key material never leaks.
    expect(JSON.stringify(entries)).not.toContain("gsk-");
  });

  it("reads v1 plaintext files", () => {
    const home = makeHome();
    fs.writeFileSync(
      path.join(home, "dyad-providers.json"),
      JSON.stringify({
        version: 1,
        providers: {
          groq: { apiKey: "gsk-test-key" },
          custom: { apiBaseUrl: "https://example.com/v1" },
        },
      }),
    );
    const entries = readProviderKeyPresence(home);
    expect(entries.find((e) => e.id === "groq")).toMatchObject({ configured: true });
    expect(entries.find((e) => e.id === "custom")).toMatchObject({
      configured: false,
      hasBaseUrl: true,
    });
    expect(JSON.stringify(entries)).not.toContain("gsk-test-key");
  });

  it("reads v2 encrypted files with the machine key", () => {
    const home = makeHome();
    const key = crypto.randomBytes(32);
    fs.writeFileSync(path.join(home, ".providers.key"), key);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify({ providers: { google: { apiKey: "AIza-test" } } }), "utf-8"),
      cipher.final(),
    ]);
    fs.writeFileSync(
      path.join(home, "dyad-providers.json"),
      JSON.stringify({
        version: 2,
        encrypted: {
          iv: iv.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
          data: data.toString("base64"),
        },
      }),
    );
    const entries = readProviderKeyPresence(home);
    expect(entries.find((e) => e.id === "google")).toMatchObject({ configured: true });
    expect(entries.find((e) => e.id === "groq")).toMatchObject({ configured: false });
    expect(JSON.stringify(entries)).not.toContain("AIza-test");
  });

  it("reads empty without the machine key for v2 files", () => {
    const home = makeHome();
    fs.writeFileSync(
      path.join(home, "dyad-providers.json"),
      JSON.stringify({ version: 2, encrypted: { iv: "x", tag: "y", data: "z" } }),
    );
    const entries = readProviderKeyPresence(home);
    expect(entries.every((e) => e.configured === false)).toBe(true);
  });

  it("honors env vars and marks local runtimes keyless", () => {
    process.env.GROQ_API_KEY = "gsk-env-key";
    const entries = readProviderKeyPresence(makeHome());
    expect(entries.find((e) => e.id === "groq")).toMatchObject({ configured: true });
    expect(entries.find((e) => e.id === "ollama")).toMatchObject({
      configured: false,
      keyless: true,
    });
    expect(JSON.stringify(entries)).not.toContain("gsk-env-key");
  });
});
