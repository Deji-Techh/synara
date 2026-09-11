// FILE: databaseSettingsStore.test.ts
// Purpose: Guards DB connection/network validation (pure, no network).

import { describe, expect, it } from "vitest";
import {
  connectionMatchesWorkspace,
  normalizeScopeRoot,
  validateConnection,
  validateNetwork,
} from "./databaseSettingsStore";

describe("databaseSettingsStore", () => {
  it("accepts valid connections and networks", () => {
    expect(
      validateConnection({ id: "a", name: "Prod", databaseUrl: "postgres://u@h/db" }, []),
    ).toEqual([]);
    expect(
      validateNetwork(
        { id: "a", name: "Base", chainKind: "evm", chainId: "8453", rpcUrl: "https://x" },
        [],
      ),
    ).toEqual([]);
  });

  it("rejects blanks, duplicates, and bad URLs", () => {
    expect(validateConnection({ id: "a", name: "", databaseUrl: "" }, [])).toContain(
      "Name is required.",
    );
    expect(
      validateConnection({ id: "b", name: "PROD", databaseUrl: "postgres://u@h/db" }, [
        { id: "a", name: "prod", provider: "supabase", databaseUrl: "postgres://u@h/db", enabled: true, createdAt: 0 },
      ]),
    ).toContain('Another connection is already named "PROD".');
    expect(validateConnection({ id: "a", name: "x", databaseUrl: "mysql://h" }, [])).toContain(
      "DATABASE_URL must be a postgres:// connection string.",
    );
    expect(validateNetwork({ id: "a", name: "", chainKind: "evm", chainId: "", rpcUrl: "x" }, [])).toEqual([
      "Name is required.",
      "A valid http(s) RPC URL is required.",
      "Chain ID is required (e.g. 1, 137, solana-mainnet).",
    ]);
  });

  it("validates project scope and matches workspaces slash-insensitively", () => {
    expect(
      validateConnection(
        { id: "a", name: "x", databaseUrl: "postgres://u@h/db", scope: { type: "project", workspaceRoot: " " } },
        [],
      ),
    ).toContain("Project scope needs a workspace root.");
    expect(normalizeScopeRoot("C:\\work\\app\\")).toBe("C:/work/app");
    const bound = {
      id: "a",
      name: "x",
      provider: "neon" as const,
      databaseUrl: "postgres://u@h/db",
      enabled: true,
      createdAt: 0,
      scope: { type: "project" as const, workspaceRoot: "/work/app/" },
    };
    expect(connectionMatchesWorkspace(bound, "/work/app")).toBe(true);
    expect(connectionMatchesWorkspace(bound, "/work/other")).toBe(false);
    expect(connectionMatchesWorkspace({ ...bound, scope: { type: "global" as const } }, "/work/app")).toBe(false);
  });
});
