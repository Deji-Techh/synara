// FILE: supabaseDeploy.test.ts
// Purpose: Deploy pipeline (bundle/activate/prune/progress/affected) with
// injected remote fakes — no Supabase credentials needed.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deployAffectedSupabaseFunctions,
  deployAllSupabaseFunctions,
  deploySupabaseFunctions,
  extractFunctionName,
  extractFunctionNameFromPath,
  isServerFunction,
  isSharedServerModule,
  type SupabaseDeployDeps,
  type SupabaseDeployProgress,
} from "./supabaseDeploy.ts";

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-supadep-"));
  for (const name of ["alpha", "beta"]) {
    fs.mkdirSync(path.join(dir, "supabase", "functions", name), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "supabase", "functions", name, "index.ts"),
      "Deno.serve(() => new Response('ok'));\n",
    );
  }
  return dir;
}

function fakeDeps(overrides?: Partial<SupabaseDeployDeps>): {
  deps: SupabaseDeployDeps;
  store: { bundled: string[]; activated: number; deleted: string[] };
} {
  const store = { bundled: [] as string[], activated: 0, deleted: [] as string[] };
  const deps: SupabaseDeployDeps = {
    bundleFunction: async ({ functionName }) => {
      store.bundled.push(functionName);
      return { slug: functionName };
    },
    activateFunctions: async () => {
      store.activated++;
    },
    listFunctions: async () => [],
    deleteFunction: async ({ functionName }) => {
      store.deleted.push(functionName);
    },
    ...overrides,
  };
  return { deps, store };
}

const baseArgs = (appPath: string, deps: SupabaseDeployDeps) => ({
  appPath,
  projectId: "proj-1",
  organizationSlug: null,
  skipPruneEdgeFunctions: true,
  deps,
});

describe("supabase deploy pipeline", () => {
  it("bundles then activates and finishes", async () => {
    const dir = fixture();
    const { deps, store } = fakeDeps();
    const phases: string[] = [];
    const errors = await deployAllSupabaseFunctions({
      ...baseArgs(dir, deps),
      onProgress: (p: SupabaseDeployProgress) => phases.push(p.phase),
    });
    expect(errors).toEqual([]);
    expect(store.bundled.sort()).toEqual(["alpha", "beta"]);
    expect(store.activated).toBe(1);
    expect(phases[0]).toBe("deploying");
    expect(phases.at(-1)).toBe("finished");
  });

  it("fails when activation fails", async () => {
    const dir = fixture();
    const { deps, store } = fakeDeps({
      activateFunctions: async () => {
        throw new Error("activation down");
      },
    });
    const phases: string[] = [];
    const errors = await deployAllSupabaseFunctions({
      ...baseArgs(dir, deps),
      onProgress: (p) => phases.push(p.phase),
    });
    expect(errors.join("\n")).toContain("bulk update");
    expect(phases.at(-1)).toBe("failed");
  });

  it("prunes deployed functions missing locally", async () => {
    const dir = fixture();
    const { deps, store } = fakeDeps({
      listFunctions: async () => [{ slug: "alpha" }, { slug: "ghost" }],
    });
    const errors = await deploySupabaseFunctions({
      ...baseArgs(dir, deps),
      skipPruneEdgeFunctions: false,
    });
    expect(errors).toEqual([]);
    expect(store.deleted).toEqual(["ghost"]);
  });

  it("reports missing requested functions", async () => {
    const dir = fixture();
    const { deps, store } = fakeDeps();
    const errors = await deploySupabaseFunctions({
      ...baseArgs(dir, deps),
      functionNames: ["alpha", "missing"],
    });
    expect(errors.join("\n")).toContain("missing");
    expect(store.bundled).toEqual(["alpha"]);
  });

  it("deploys affected sets from pending names", async () => {
    const dir = fixture();
    const { deps, store } = fakeDeps();
    const errors = await deployAffectedSupabaseFunctions({
      ...baseArgs(dir, deps),
      sharedModulesChanged: false,
      changedSharedModulePaths: [],
      pendingFunctionDeploys: ["beta"],
    });
    expect(errors).toEqual([]);
    expect(store.bundled).toEqual(["beta"]);
  });

  it("classifies function paths", () => {
    expect(isServerFunction("supabase/functions/a/index.ts")).toBe(true);
    expect(isServerFunction("supabase/functions/_shared/u.ts")).toBe(false);
    expect(isSharedServerModule("supabase/functions/_shared/u.ts")).toBe(true);
    expect(extractFunctionNameFromPath("supabase/functions/hello/lib/utils.ts")).toBe("hello");
    expect(() => extractFunctionNameFromPath("other/x.ts")).toThrow(/Invalid Supabase/);
    expect(extractFunctionName("[todo-activity] fetched 0")).toBe("todo-activity");
    expect(extractFunctionName("plain")).toBeUndefined();
  });
});
