// FILE: customProviders.test.ts
// Purpose: 009 M5 gate — custom provider CRUD, `custom::` id rules,
// per-provider custom models, registry resolution.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CUSTOM_PROVIDER_PREFIX,
  CustomProviderStore,
  resetSharedCustomProviders,
  resolveProviderDef,
  sharedCustomProviders,
  validateCustomProviderDef,
  validateCustomProviderId,
} from "./customProviders.ts";

let prevCaideHome: string | undefined;

beforeEach(() => {
  prevCaideHome = process.env.CAIDE_HOME;
  process.env.CAIDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "caide-custom-"));
  resetSharedCustomProviders();
});

afterEach(() => {
  resetSharedCustomProviders();
  if (prevCaideHome === undefined) delete process.env.CAIDE_HOME;
  else process.env.CAIDE_HOME = prevCaideHome;
});

const BUILTINS = new Set(["openai", "custom"]);

describe("custom provider ids (donor custom:: convention)", () => {
  it("requires the prefix, a slug body, and no builtin collision", () => {
    expect(validateCustomProviderId("openai", BUILTINS).ok).toBe(false);
    expect(validateCustomProviderId("custom::", BUILTINS)).toEqual({
      ok: false,
      message: expect.stringContaining("slug"),
    });
    expect(validateCustomProviderId("custom::Bad_Slug!", BUILTINS).ok).toBe(false);
    expect(validateCustomProviderId("custom::my-proxy", BUILTINS)).toEqual({ ok: true });
  });

  it("validates definitions", () => {
    expect(
      validateCustomProviderDef({ id: "custom::p", displayName: "P", baseUrl: "https://x/v1" }),
    ).toEqual({ ok: true });
    expect(
      validateCustomProviderDef({ id: "custom::p", displayName: " ", baseUrl: "https://x/v1" }).ok,
    ).toBe(false);
    expect(
      validateCustomProviderDef({ id: "custom::p", displayName: "P", baseUrl: "ftp://x" }).ok,
    ).toBe(false);
    expect(
      validateCustomProviderDef({
        id: "custom::p",
        displayName: "P",
        baseUrl: "https://x/v1",
        envVarName: "lowercase",
      }).ok,
    ).toBe(false);
  });
});

describe("custom provider store", () => {
  it("creates, reads, updates, and deletes providers", () => {
    const store = sharedCustomProviders();
    expect(store.listProviders()).toEqual([]);
    store.saveProvider({ id: "custom::proxy", displayName: " Proxy ", baseUrl: "https://p/v1/" });
    expect(store.getProvider("custom::proxy")).toMatchObject({
      id: "custom::proxy",
      displayName: "Proxy",
      baseUrl: "https://p/v1",
    });
    expect(store.listProviders()).toHaveLength(1);
    store.saveProvider({ id: "custom::proxy", displayName: "Proxy2", baseUrl: "https://p/v1" });
    expect(store.getProvider("custom::proxy")?.displayName).toBe("Proxy2");
    expect(store.deleteProvider("custom::proxy")).toBe(true);
    expect(store.deleteProvider("custom::proxy")).toBe(false);
    expect(store.getProvider("custom::proxy")).toBeUndefined();
  });

  it("prefix constant matches the donor convention", () => {
    expect(CUSTOM_PROVIDER_PREFIX).toBe("custom::");
  });

  it("stores per-provider custom models, dropping blanks", () => {
    const store = new CustomProviderStore(path.join(process.env.CAIDE_HOME as string, "cp.json"));
    const models = store.setCustomModels("custom::proxy", [
      { name: "  " },
      { name: "m1", displayName: "M1", contextWindow: 1000.7, temperature: 0.5 },
      { name: "m2" },
    ]);
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({ name: "m1", contextWindow: 1000 });
    expect(store.getCustomModels("custom::proxy")).toHaveLength(2);
    expect(store.getCustomModels("custom::nope")).toEqual([]);
    // Empty set clears.
    expect(store.setCustomModels("custom::proxy", [])).toEqual([]);
    expect(store.getCustomModels("custom::proxy")).toEqual([]);
  });

  it("resolves static first, customs second", () => {
    expect(resolveProviderDef("openai")?.displayName).toBe("OpenAI");
    expect(resolveProviderDef("custom::nope")).toBeUndefined();
    sharedCustomProviders().saveProvider({
      id: "custom::proxy",
      displayName: "Proxy",
      baseUrl: "https://p/v1",
      envVarName: "PROXY_KEY",
    });
    expect(resolveProviderDef("custom::proxy")).toMatchObject({
      id: "custom::proxy",
      baseUrl: "https://p/v1",
      envVarName: "PROXY_KEY",
      transport: "streamable",
    });
  });
});
