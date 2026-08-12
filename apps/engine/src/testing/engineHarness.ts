// FILE: src/testing/engineHarness.ts
// Purpose: setupEngineHarness — fast, parallel-safe vitest integration harness
// for the engine, ported from dyad x caide's setupChatFlowHarness and adapted
// to the rebuilt engine: no Electron, no drizzle, no IPC. The engine keeps its
// own SQLite (plan decision B) but M2's agent loop is stateless, so the harness
// drives the real Agent (AI-SDK streamText over HTTP) against the real
// in-process fake-LLM server (`tc=<fixture>` protocol, [dump] mechanism).
//
// What is real: the agent loop, the AI-SDK streaming HTTP client, the fake-LLM
// server (serving apps/engine/fixtures/*.md), a real git workspace.
// What is mocked: nothing — external services are faked in-process.
//
// Parallel safety: ephemeral port (0), unique temp dir keyed by pid+random,
// private dump dir. `dispose()` closes the server and removes the temp dir.
// See ./ENGINE_HARNESS.md for the cookbook.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  Agent,
  type AgentMessage,
  type EngineModelConfig,
  type TurnResult,
} from "../agent/agentLoop.ts";
import type { ToolContext, ToolDefinition } from "../agent/tool.ts";
import { startFakeLlmServer, type FakeLlmServerHandle } from "./fakeLlmServer.ts";

export interface EngineHarnessOptions {
  /** Where the fake server reads `tc=<name>` fixtures from. */
  fixturesDir?: string;
  /** Model config the harness agent uses; defaults to the fake server. */
  model?: Partial<Omit<EngineModelConfig, "baseUrl">> & { baseUrl?: string };
  systemPrompt?: string;
  initialHistory?: readonly AgentMessage[];
  /** Tools exposed to the harness agent (bound to the workspace context). */
  tools?: readonly ToolDefinition[];
  /** Overrides the default tool execution context (workspace/app dirs). */
  toolContext?: Partial<ToolContext>;
  /** Max agent-loop steps per turn; default 20 when tools are present. */
  maxSteps?: number;
  /** Show the fake server's per-request logs (default quiet). */
  verboseFakeLlm?: boolean;
  /** Seed files written into the workspace before the initial commit. */
  seedFiles?: Record<string, string>;
}

function git(workspaceDir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: workspaceDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export interface EngineHarness {
  readonly workspaceDir: string;
  readonly fakeLlmUrl: string;
  readonly fakeLlmPort: number;
  readonly fakeLlm: FakeLlmServerHandle;
  readonly model: EngineModelConfig;
  readonly agent: Agent;
  readonly dumpDir: string;

  /** Runs the real agent loop against the fake LLM. */
  get runTurn(): (
    prompt: string,
    opts?: {
      abortSignal?: AbortSignal;
      onTextDelta?: (delta: string) => void;
      onToolCall?: (call: { name: string; args: unknown }) => void;
    },
  ) => Promise<TurnResult>;
  /** Reads the newest [engine-dump-path] payload written by the fake server. */
  getServerDump(dumpIndex?: number): { parsed: unknown; dumpPath: string };
  /** Output of the newest dump, prettified for snapshotting. */
  getServerDumpText(dumpIndex?: number): string;
  /** [{ relativePath, content }] of all workspace files, sorted. */
  getWorkspaceFiles(): Array<{ relativePath: string; content: string }>;
  readWorkspaceFile(relativePath: string): string;
  workspaceFileExists(relativePath: string): boolean;
  /** Newest-first commit subjects, e.g. ["abc1234 commit 2", "def5678 init"] */
  gitLog(): string[];
  gitStatus(): Record<string, string>;
  dispose(): Promise<void>;
}

const SECOND_SETUP_ERROR =
  "Second engine harness setup in one process — one harness per test FILE " +
  "(forks pool isolation); split the file";

let activeEngineHarness = false;

export async function setupEngineHarness(
  options: EngineHarnessOptions = {},
): Promise<EngineHarness> {
  if (activeEngineHarness) {
    throw new Error(SECOND_SETUP_ERROR);
  }
  activeEngineHarness = true;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synara-engine-harness-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });
  const dumpDir = path.join(tempRoot, "dumps");

  const fakeLlm = await startFakeLlmServer({
    fixturesDir: options.fixturesDir,
    dumpDir,
    quiet: !options.verboseFakeLlm,
  });

  try {
    // Seed the workspace and make the initial commit.
    for (const [relativePath, content] of Object.entries(options.seedFiles ?? {})) {
      const filePath = path.join(workspaceDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    }
    git(workspaceDir, ["init", "-b", "main"]);
    git(workspaceDir, ["config", "user.email", "harness@synara.engine"]);
    git(workspaceDir, ["config", "user.name", "Engine Harness"]);
    git(workspaceDir, ["add", "-A"]);
    git(workspaceDir, ["commit", "-m", "chore: initial commit"]);

    const baseUrl = options.model?.baseUrl ?? `${fakeLlm.url}/v1`;
    const model: EngineModelConfig = {
      baseUrl,
      apiKey: options.model?.apiKey ?? "test-key",
      modelId: options.model?.modelId ?? "test-model",
    };
    const toolContext: ToolContext = {
      workspaceDir,
      appDir: workspaceDir,
      ...options.toolContext,
    };
    const agent = new Agent({
      model,
      systemPrompt: options.systemPrompt,
      initialHistory: options.initialHistory,
      tools: options.tools,
      toolContext,
      maxSteps: options.maxSteps,
    });

    const getServerDump = (dumpIndex = -1) => {
      const dumpPaths = fs
        .readdirSync(dumpDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => path.join(dumpDir, name));
      if (dumpPaths.length === 0) {
        throw new Error("No fake-LLM dump found — trigger [dump] first");
      }
      const dumpPath = dumpIndex === -1 ? dumpPaths[dumpPaths.length - 1] : dumpPaths[dumpIndex];
      return { parsed: JSON.parse(fs.readFileSync(dumpPath, "utf8")), dumpPath };
    };

    return {
      workspaceDir,
      fakeLlmUrl: fakeLlm.url,
      fakeLlmPort: fakeLlm.port,
      fakeLlm,
      model,
      agent,
      dumpDir,
      runTurn: (prompt, opts) => agent.runTurn(prompt, opts),
      getServerDump,
      getServerDumpText: (dumpIndex = -1) =>
        JSON.stringify(getServerDump(dumpIndex).parsed, null, 2),
      getWorkspaceFiles: () => {
        const files: Array<{ relativePath: string; content: string }> = [];
        const walk = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === ".git") {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(workspaceDir, fullPath);
            if (entry.isDirectory()) {
              walk(fullPath);
            } else {
              files.push({ relativePath, content: fs.readFileSync(fullPath, "utf8") });
            }
          }
        };
        walk(workspaceDir);
        return files.sort((a, b) =>
          a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
        );
      },
      readWorkspaceFile: (relativePath) =>
        fs.readFileSync(path.join(workspaceDir, relativePath), "utf8"),
      workspaceFileExists: (relativePath) => fs.existsSync(path.join(workspaceDir, relativePath)),
      gitLog: () => {
        const output = git(workspaceDir, ["log", "--pretty=format:%h %s"]);
        return output.length === 0 ? [] : output.split("\n");
      },
      gitStatus: () => {
        const output = git(workspaceDir, ["status", "--porcelain"]);
        return Object.fromEntries(
          output
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => [line.slice(3), line.slice(0, 2).trim()]),
        );
      },
      dispose: async () => {
        await fakeLlm.close().catch(() => undefined);
        fs.rmSync(tempRoot, { recursive: true, force: true });
        activeEngineHarness = false;
      },
    };
  } catch (error) {
    await fakeLlm.close().catch(() => undefined);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    activeEngineHarness = false;
    throw error;
  }
}
