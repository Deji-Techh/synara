// FILE: turnContext.ts
// Purpose: M3 wire #1 — per-turn assembly for the agent loop. Resolves the
// project framework, provider connection, DB link, MCP registry, and runner
// seams from explicit inputs (no global settings reads), builds the unified
// tool set (harness core/preview/db-panel + dyad editing/vcs/plan/mcp/misc/
// sandbox/web/db) filtered by dyad permissions, and wraps execution with
// consent + UI routing (database auto-reveal, consent round-trip).
// The WS/server layer provides settings, runners, and callbacks; tests and
// the loop inject fakes.

import type { ToolDef } from "../tools/defineTool.ts";
import { ALL_CORE_TOOLS } from "../tools/coreTools.ts";
import { ALL_PREVIEW_TOOLS } from "../tools/previewTools.ts";
import { ALL_DB_PANEL_TOOLS, shouldRevealDatabasePanel } from "../../dyad/db/dbPanel.ts";
import { ALL_FILE_EDIT_TOOLS } from "../../dyad/editing/index.ts";
import { ALL_GIT_TOOLS } from "../../dyad/vcs/index.ts";
import { ALL_PLAN_TOOLS } from "../../dyad/plan/index.ts";
import { ALL_MCP_TOOLS, setMcpToolRegistry, type McpToolRegistry } from "../../dyad/mcp/index.ts";
import { ALL_MISC_TOOLS } from "../../dyad/misc/index.ts";
import { ALL_SANDBOX_TOOLS } from "../../dyad/sandbox/index.ts";
import { ALL_WEB_FETCH_TOOLS, ALL_WEB_SEARCH_TOOLS, ALL_IMAGE_TOOLS, ALL_CODE_TOOLS } from "../../dyad/web/index.ts";
import { ALL_DB_TOOLS, linkDatabase, type DbLink } from "../../dyad/db/index.ts";
import {
  MemoryConsentStore,
  requireAgentToolConsent,
  shouldIncludeTool,
  type ConsentStore,
  type ConsentRequestFn,
  type ToolSetOptions,
} from "../../dyad/tools/index.ts";
import {
  resolveAutoProvider,
  resolveConnection,
  type SettingsLike,
} from "../../dyad/providers/index.ts";
import { setContextSummarizer } from "../../dyad/misc/index.ts";
import { setSkillRunner } from "../../dyad/sandbox/index.ts";
import { setExplorerRunner as setCodeExplorerRunner } from "../../dyad/web/index.ts";
import { streamProvider } from "../provider/apiAdapter.ts";
import type { CaideFramework } from "../../dyad/prompts/index.ts";
import { normalizeCaideFramework } from "../../dyad/prompts/index.ts";

export interface TurnFramework {
  framework: CaideFramework | undefined;
  appPath: string;
}

export interface TurnProvider {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string | undefined;
}

export interface TurnContextInput {
  sessionId: string;
  appPath: string;
  /** Explicit framework; detected from workspace when omitted. */
  framework?: CaideFramework;
  /** Provider settings (keys win over env). Omit providerId for auto. */
  settings?: SettingsLike;
  providerId?: string;
  modelId?: string;
  /** Pre-linked DB (add_integration result); otherwise resolved lazily. */
  dbLink?: DbLink;
  mcpRegistry?: McpToolRegistry | null;
  store?: ConsentStore;
  options?: ToolSetOptions;
  requestConsent?: ConsentRequestFn;
  autoApproveNonSchemaSql?: boolean;
}

export interface TurnContext {
  sessionId: string;
  appPath: string;
  framework: CaideFramework | undefined;
  provider: TurnProvider;
  tools: ToolDef[];
  store: ConsentStore;
  /** Execute one tool call with consent gating + UI routing. */
  executeWithConsent(toolName: string, args: unknown, toolId: string): Promise<unknown>;
  /** UI actions for a tool_call event (database reveal today; more in M3b). */
  routeToolEvent(toolName: string): { revealDatabase: boolean };
  cleanup(): void;
}

export async function detectFrameworkFromDisk(appPath: string): Promise<CaideFramework | undefined> {
  const fs = await import("node:fs");
  try {
    const raw = fs.readFileSync(`${appPath}/.caide/framework.json`, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fw = normalizeCaideFramework(String(parsed.framework ?? "").toLowerCase());
    if (fw) return fw;
  } catch {
    // fall through to heuristics
  }
  try {
    if (fs.existsSync(`${appPath}/pubspec.yaml`)) return "flutter";
    const pkgRaw = fs.readFileSync(`${appPath}/package.json`, "utf8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, unknown>),
      ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
    };
    if (deps.expo || deps["react-native"] || deps["expo-status-bar"]) return "react-native";
    return "website";
  } catch {
    return undefined;
  }
}

const UNIFIED_DEFS: ToolDef[] = [
  ...ALL_CORE_TOOLS,
  ...ALL_PREVIEW_TOOLS,
  ...ALL_DB_PANEL_TOOLS,
  ...ALL_FILE_EDIT_TOOLS,
  ...ALL_GIT_TOOLS,
  ...ALL_PLAN_TOOLS,
  ...ALL_MCP_TOOLS,
  ...ALL_MISC_TOOLS,
  ...ALL_SANDBOX_TOOLS,
  ...ALL_WEB_FETCH_TOOLS,
  ...ALL_WEB_SEARCH_TOOLS,
  ...ALL_IMAGE_TOOLS,
  ...ALL_CODE_TOOLS,
  ...ALL_DB_TOOLS,
];

export function allUnifiedToolDefs(): ToolDef[] {
  return [...UNIFIED_DEFS];
}

export function createTurnContext(input: TurnContextInput): TurnContext {
  const store = input.store ?? new MemoryConsentStore();
  const options = input.options ?? {};

  // Provider: explicit id or auto by key presence. Local runtimes need no key.
  const providerId = input.providerId ?? resolveAutoProvider(input.settings ?? {});
  const modelId = input.modelId ?? "auto";
  const connection = resolveConnection(providerId, modelId, input.settings ?? {});

  // Runner seams: cheap-model provider streaming for synthesis skills.
  const synthesize = async (sys: string, prompt: string): Promise<string> => {
    if (!connection.apiKey && providerId !== "ollama" && providerId !== "lmstudio") {
      throw new Error("No provider key configured for synthesis skills.");
    }
    let text = "";
    const stream = streamProvider({
      modelId,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey ?? "ollama",
      system: sys,
      messages: [{ role: "user", content: prompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "token") text += chunk.content;
    }
    return text;
  };
  setContextSummarizer(async ({ system, prompt }) => synthesize(system, prompt));
  setCodeExplorerRunner(async ({ system, prompt }) => synthesize(system, prompt));
  setSkillRunner(async ({ system, prompt }) => synthesize(system, prompt));

  if (input.mcpRegistry !== undefined) setMcpToolRegistry(input.mcpRegistry);
  if (input.dbLink) linkDatabase(input.sessionId, input.dbLink);

  const included = UNIFIED_DEFS.filter((def) =>
    shouldIncludeTool(def.name, {}, options, store),
  );

  const requestConsent: ConsentRequestFn =
    input.requestConsent ?? (async () => "decline" as const);

  return {
    sessionId: input.sessionId,
    appPath: input.appPath,
    framework: input.framework,
    provider: {
      providerId,
      modelId,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
    },
    tools: included,
    store,
    async executeWithConsent(toolName: string, args: unknown, toolId: string): Promise<unknown> {
      const def = included.find((d) => d.name === toolName);
      if (!def) throw new Error(`Tool not available this turn: ${toolName}`);
      const allowed = await requireAgentToolConsent({
        sessionId: input.sessionId,
        toolName,
        store,
        autoApproveNonSchemaSql: input.autoApproveNonSchemaSql,
        requestConsent,
      });
      if (!allowed) throw new Error(`Tool call declined: ${toolName}`);
      return def.execute(args, {
        signal: AbortSignal.timeout(600_000),
        appPath: input.appPath,
        sessionId: input.sessionId,
        toolId,
      });
    },
    routeToolEvent(toolName: string): { revealDatabase: boolean } {
      return { revealDatabase: shouldRevealDatabasePanel(toolName) };
    },
    cleanup(): void {
      setContextSummarizer(null);
      setCodeExplorerRunner(null);
      setSkillRunner(null);
    },
  };
}
