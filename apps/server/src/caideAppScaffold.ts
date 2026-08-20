// FILE: caideAppScaffold.ts
// Purpose: Best-effort Flutter scaffold for newly created caide-apps projects.
// Mirrors dyad x caide's createFromTemplate (flutter scaffold-flutter + AI_RULES.md) + git init.
// Layer: Server orchestration helper
// Exports: prepareCaideAppWorkspaceRoot

import { Effect, FileSystem, Path } from "effect";
import { isWorkspaceRootWithin } from "@caide/shared/threadWorkspace";

import { getCaideAppsBaseDirectory } from "./paths/caideApps";

const SCAFFOLD_CANDIDATES = ["scaffold-flutter", "apps/engine/scaffold", "scaffold"];

export const prepareCaideAppWorkspaceRoot = Effect.fnUntraced(function* (workspaceRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const caideBase = getCaideAppsBaseDirectory();
  // Only scaffold strict children of caide-apps, not the base itself
  const isCaideApp =
    (caideBase && isWorkspaceRootWithin(workspaceRoot, caideBase)) ||
    workspaceRoot.includes("/caide-apps/") ||
    workspaceRoot.includes("/dyad-apps/");

  if (!isCaideApp) {
    return;
  }

  // Ensure the directory exists (normalizeWorkspaceRoot already created it, but double-check)
  const exists = yield* fileSystem
    .exists(workspaceRoot)
    .pipe(Effect.catch(() => Effect.succeed(false)));
  if (!exists) {
    yield* fileSystem
      .makeDirectory(workspaceRoot, { recursive: true })
      .pipe(Effect.catch(() => Effect.void));
  }

  const entries = yield* fileSystem
    .readDirectory(workspaceRoot)
    .pipe(Effect.catch(() => Effect.succeed([] as string[])));
  const visible = entries.filter(
    (name) => name !== ".git" && !name.startsWith(".") && name !== "node_modules",
  );
  if (visible.length !== 0) {
    return;
  }

  // Find scaffold source via Effect FileSystem
  const cwd = process.cwd();
  const candidates: string[] = [];
  for (const scaffold of SCAFFOLD_CANDIDATES) {
    candidates.push(path.join(cwd, scaffold));
    candidates.push(path.join(cwd, "..", scaffold));
    candidates.push(path.join(cwd, "..", "..", scaffold));
  }
  try {
    // @ts-ignore - import.meta.dirname may not exist in all contexts
    const metaDir = (import.meta as unknown as { dirname?: string }).dirname;
    if (metaDir) {
      for (const scaffold of SCAFFOLD_CANDIDATES) {
        candidates.push(path.join(metaDir, "..", "..", "..", scaffold));
        candidates.push(path.join(metaDir, "..", scaffold));
      }
    }
  } catch {
    // ignore
  }

  let scaffoldSource: string | null = null;
  for (const candidate of candidates) {
    const candidateExists = yield* fileSystem
      .exists(candidate)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!candidateExists) continue;
    const stat = yield* fileSystem.stat(candidate).pipe(Effect.catch(() => Effect.succeed(null)));
    // @ts-ignore
    if (stat && (stat as unknown as { type: string }).type === "Directory") {
      scaffoldSource = candidate;
      break;
    }
  }

  if (!scaffoldSource) {
    yield* Effect.logWarning("caide-apps scaffold source not found, skipping template copy", {
      workspaceRoot,
    });
    return;
  }

  yield* fileSystem
    .makeDirectory(workspaceRoot, { recursive: true })
    .pipe(Effect.catch(() => Effect.void));

  yield* Effect.promise(async () => {
    const fs = await import("node:fs/promises");
    // @ts-ignore
    if (typeof (fs as unknown as { cp?: unknown }).cp === "function") {
      // @ts-ignore
      await (fs as unknown as { cp: (a: string, b: string, o: unknown) => Promise<void> }).cp(
        scaffoldSource!,
        workspaceRoot,
        {
          recursive: true,
          filter: (src: string) => {
            const base = src.split("/").pop() ?? src;
            return base !== "node_modules" && base !== ".git" && base !== ".dart_tool";
          },
        },
      );
    } else {
      const { cp } = await import("node:fs");
      await new Promise<void>((resolve, reject) => {
        cp(
          scaffoldSource!,
          workspaceRoot,
          {
            recursive: true,
            filter: (src: string) => !src.includes("node_modules") && !src.includes(".git"),
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    }
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("caide-apps scaffold copy failed", {
        workspaceRoot,
        scaffoldSource,
        cause,
      }),
    ),
  );

  const gitDir = path.join(workspaceRoot, ".git");
  const hasGit = yield* fileSystem.exists(gitDir).pipe(Effect.catch(() => Effect.succeed(false)));
  if (!hasGit) {
    yield* Effect.promise(async () => {
      const { spawn } = await import("node:child_process");
      const run = (args: string[]) =>
        new Promise<void>((resolve) => {
          const proc = spawn("git", args, { cwd: workspaceRoot, stdio: "ignore" });
          proc.on("error", () => resolve());
          proc.on("close", () => resolve());
        });
      await run(["init"]);
      await run(["config", "user.name", "Caide"]);
      await run(["config", "user.email", "caide@local"]);
      await run(["add", "."]);
      await run(["commit", "-m", "Initial commit from Caide scaffold", "--allow-empty"]);
    }).pipe(Effect.catch(() => Effect.void));
  }
});
