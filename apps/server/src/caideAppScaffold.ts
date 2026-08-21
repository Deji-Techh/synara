// FILE: caideAppScaffold.ts
// Purpose: Best-effort Flutter scaffold for newly created caide-apps projects.
// Mirrors dyad x caide's createFromTemplate (flutter scaffold-flutter + AI_RULES.md) + git init.
// Layer: Server orchestration helper
// Exports: prepareCaideAppWorkspaceRoot

import { Effect, FileSystem, Path } from "effect";
import { isWorkspaceRootWithin } from "@caide/shared/threadWorkspace";

import { getCaideAppsBaseDirectory } from "./paths/caideApps";

const SCAFFOLD_CANDIDATES = [
  "scaffold-flutter",
  "apps/engine/scaffold-flutter",
  "apps/engine/scaffold",
  "scaffold",
];

async function runFlutterCreate(workspaceRoot: string, appName: string): Promise<boolean> {
  try {
    const { spawn } = await import("node:child_process");
    const tryFlutter = (flutterCmd: string) =>
      new Promise<boolean>((resolve) => {
        // Additive: generates missing platform dirs without clobbering
        // existing lib/, pubspec.yaml, or AI_RULES.md from the template.
        const child = spawn(
          flutterCmd,
          ["create", "--org", "com.caide", "--project-name", appName, "."],
          {
            cwd: workspaceRoot,
            stdio: "ignore",
            shell: false,
            windowsHide: true,
          },
        );
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });
    const candidatesCmd = [
      "flutter",
      "/home/DejiTech/development/flutter/bin/flutter",
      "/home/DejiTech/.caide/flutter/bin/flutter",
      "/opt/flutter/bin/flutter",
    ];
    for (const cmd of candidatesCmd) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await tryFlutter(cmd);
      if (ok) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const prepareCaideAppWorkspaceRoot = Effect.fnUntraced(function* (workspaceRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const caideBase = getCaideAppsBaseDirectory();
  const isCaideApp =
    (caideBase && isWorkspaceRootWithin(workspaceRoot, caideBase)) ||
    workspaceRoot.includes("/caide-apps/") ||
    workspaceRoot.includes("/dyad-apps/");

  if (!isCaideApp) {
    return;
  }

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
  let scaffoldLooksValid = false;
  for (const candidate of candidates) {
    const candidateExists = yield* fileSystem
      .exists(candidate)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!candidateExists) continue;
    const stat = yield* fileSystem.stat(candidate).pipe(Effect.catch(() => Effect.succeed(null)));
    // @ts-ignore
    if (!stat || (stat as unknown as { type: string }).type !== "Directory") continue;
    const pubspec = path.join(candidate, "pubspec.yaml");
    const libDir = path.join(candidate, "lib");
    const hasPubspec = yield* fileSystem
      .exists(pubspec)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    const hasLib = yield* fileSystem.exists(libDir).pipe(Effect.catch(() => Effect.succeed(false)));
    if (hasPubspec && hasLib) {
      scaffoldSource = candidate;
      scaffoldLooksValid = true;
      break;
    }
    if (!scaffoldSource) {
      scaffoldSource = candidate;
    }
  }

  yield* fileSystem
    .makeDirectory(workspaceRoot, { recursive: true })
    .pipe(Effect.catch(() => Effect.void));

  if (scaffoldLooksValid && scaffoldSource) {
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

    const appName =
      path
        .basename(workspaceRoot)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase() || "caide_app";
    const created = yield* Effect.promise(() => runFlutterCreate(workspaceRoot, appName));
    if (!created) {
      yield* Effect.logWarning(
        `flutter create failed after template copy for ${workspaceRoot}; platform dirs may be missing`,
      );
    }
  } else {
    const appName =
      path
        .basename(workspaceRoot)
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase() || "caide_app";
    yield* Effect.logInfo(
      `flutter: scaffold invalid/missing at ${scaffoldSource ?? "none"}, running flutter create for ${workspaceRoot}`,
    );
    yield* Effect.promise(() => runFlutterCreate(workspaceRoot, appName));
  }

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
