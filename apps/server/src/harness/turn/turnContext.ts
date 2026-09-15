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
import {
  ALL_GIT_HISTORY_TOOLS,
  ALL_GIT_TOOLS,
  ALL_PRE_COMMIT_TOOLS,
} from "../../dyad/vcs/index.ts";
import { ALL_CHAT_HISTORY_TOOLS } from "../../dyad/history/index.ts";
import { ALL_PLAN_TOOLS } from "../../dyad/plan/index.ts";
import { ALL_BLUEPRINT_TOOLS } from "../../dyad/plan/blueprintTools.ts";
import { assertAppBlueprintApproved } from "../../dyad/plan/blueprintStore.ts";
import {
  CAPABILITY_GATED_BLUEPRINT_TOOLS,
  PLANNING_SPECIFIC_TOOLS,
} from "../../dyad/tools/toolCatalog.ts";
import { ALL_MCP_TOOLS, setMcpToolRegistry, type McpToolRegistry } from "../../dyad/mcp/index.ts";
import { ALL_MISC_TOOLS } from "../../dyad/misc/index.ts";
import { ALL_GOAL_TOOLS } from "../../dyad/goals/index.ts";
import { ALL_GITHUB_TOOLS, ALL_VERCEL_TOOLS, ALL_COOLIFY_TOOLS } from "../../dyad/publish/index.ts";
import { ALL_SHARE_TOOLS } from "../../dyad/share/index.ts";
import { ALL_VERIFY_TOOLS } from "../../dyad/verify/index.ts";
import { ALL_SANDBOX_TOOLS } from "../../dyad/sandbox/index.ts";
import {
  ALL_WEB_FETCH_TOOLS,
  ALL_WEB_SEARCH_TOOLS,
  ALL_IMAGE_TOOLS,
  ALL_CODE_TOOLS,
} from "../../dyad/web/index.ts";
import { ALL_WEB3_TOOLS } from "../../dyad/web3/index.ts";
import { ALL_DB_TOOLS, getDatabaseLink, linkDatabase, type DbLink } from "../../dyad/db/index.ts";
import {
  MemoryConsentStore,
  requireAgentToolConsent,
  shouldIncludeTool,
  type ConsentStore,
  type ConsentRequestFn,
  type SqlConsentMetadata,
  type ToolSetOptions,
} from "../../dyad/tools/index.ts";
import {
  resolveAutoProvider,
  resolveConnection,
  resolveProviderDefaultModel,
  type SettingsLike,
} from "../../dyad/providers/index.ts";
import { setContextSummarizer } from "../../dyad/misc/index.ts";
import { sqlConsentInfo } from "../../dyad/db/dbTools.ts";
import { setSkillRunner } from "../../dyad/sandbox/index.ts";
import { setSubagentToolSource } from "../../dyad/sandbox/subagentLoop.ts";
import { setExplorerRunner as setCodeExplorerRunner } from "../../dyad/web/index.ts";
import { setImageProvider } from "../../dyad/web/generateImage.ts";
import { setWebSearchProvider } from "../../dyad/web/webSearch.ts";
import {
  autoImageProvider,
  cascadeImageProvider,
  resolveImageLegs,
} from "../../dyad/web/keyedImages.ts";
import { sharedProviderSecrets } from "../../dyad/providers/secrets.ts";
import { recordSessionToolCall } from "./sessionStores.ts";
import { autoWebSearchProvider } from "../../dyad/web/keyedSearch.ts";
import { streamProvider } from "../provider/apiAdapter.ts";
import type { CaideFramework } from "../../dyad/prompts/index.ts";
import { detectFrameworkFromDisk } from "../../dyad/prompts/frameworkDetect.ts";

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
  /** Composer access mode (e.g. "full-access") — drives consent bypass. */
  runtimeMode?: string;
  /** MCP consent round-trip for sandbox host calls (gateway bridge). */
  requestMcpConsent?: import("../../dyad/mcp/mcpConsent.ts").McpConsentRequestFn;
}

export interface TurnContext {
  sessionId: string;
  appPath: string;
  framework: CaideFramework | undefined;
  provider: TurnProvider;
  tools: ToolDef[];
  store: ConsentStore;
  /** Execute one tool call with consent gating + UI routing. */
  executeWithConsent(
    toolName: string,
    args: unknown,
    toolId: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  /** UI actions for a tool_call event (database reveal today; more in M3b). */
  routeToolEvent(toolName: string): { revealDatabase: boolean };
  cleanup(): void;
}

/** Framework detection from workspace files — re-exported here for compatibility. */
export { detectFrameworkFromDisk } from "../../dyad/prompts/frameworkDetect.ts";
export { detectWeb3App } from "../../dyad/prompts/frameworkDetect.ts";

/**
 * Consent-card input preview (donor getConsentPreview parity): per-tool
 * presentCall rendering, best-effort — never fails the turn when args do
 * not match the tool schema.
 */
function presentToolCall(def: ToolDef, args: unknown): string | null {
  try {
    return def.presentCall?.(args) ?? null;
  } catch {
    return null;
  }
}

/**
 * SQL consent metadata for the safe-SQL auto-approve (donor parity):
 * only execute_sql calls carry it; unparseable input yields no metadata
 * (fail-closed — the card asks).
 */
function sqlMetadataForConsent(toolName: string, args: unknown): SqlConsentMetadata | null {
  if (toolName !== "execute_sql") return null;
  const query = (args as { query?: unknown } | null)?.query;
  if (typeof query !== "string" || query.length === 0) return null;
  try {
    const info = sqlConsentInfo(query);
    return { sqlMutatesSchema: info.mutatesSchema, sqlDeletesData: info.deletesData };
  } catch {
    return null;
  }
}

const UNIFIED_DEFS: ToolDef[] = [
  ...ALL_CORE_TOOLS,
  ...ALL_PREVIEW_TOOLS,
  ...ALL_DB_PANEL_TOOLS,
  ...ALL_FILE_EDIT_TOOLS,
  ...ALL_GIT_TOOLS,
  ...ALL_GIT_HISTORY_TOOLS,
  ...ALL_PRE_COMMIT_TOOLS,
  ...ALL_CHAT_HISTORY_TOOLS,
  ...ALL_PLAN_TOOLS,
  ...ALL_BLUEPRINT_TOOLS,
  ...ALL_MCP_TOOLS,
  ...ALL_MISC_TOOLS,
  ...ALL_GOAL_TOOLS,
  ...ALL_GITHUB_TOOLS,
  ...ALL_VERCEL_TOOLS,
  ...ALL_COOLIFY_TOOLS,
  ...ALL_SHARE_TOOLS,
  ...ALL_VERIFY_TOOLS,
  ...ALL_SANDBOX_TOOLS,
  ...ALL_WEB_FETCH_TOOLS,
  ...ALL_WEB_SEARCH_TOOLS,
  ...ALL_IMAGE_TOOLS,
  ...ALL_CODE_TOOLS,
  ...ALL_WEB3_TOOLS,
  ...ALL_DB_TOOLS,
];

export function allUnifiedToolDefs(): ToolDef[] {
  return [...UNIFIED_DEFS];
}

export function createTurnContext(input: TurnContextInput): TurnContext {
  const store = input.store ?? new MemoryConsentStore();
  const options = input.options ?? {};

  // Full access bypass: turn-scoped only. Deliberately NOT seeded into the
  // session store: seeding would poison later turns (a full-access Turn 1
  // would leave Ask-mode Turn 2 pre-approved). Explicit "never" bans are
  // enforced in requireAgentToolConsent + stored-denied checks, which run
  // before any bypass.
  const consentBypass =
    typeof input.runtimeMode === "string" &&
    input.runtimeMode.replace(/[^a-z]/gi, "").toLowerCase() === "fullaccess";

  // Provider: explicit id or auto by key presence. Local runtimes need no key.
  const providerId = input.providerId ?? resolveAutoProvider(input.settings ?? {});
  // Placeholder slugs must never reach an endpoint verbatim ("auto" 404s).
  // Prefer the caller's concrete model, else the provider default.
  const modelId = resolveProviderDefaultModel(providerId, input.modelId) ?? "auto";
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
  setSubagentToolSource(() => UNIFIED_DEFS);
  // Keyed web providers resolve from server env (Tavily > Brave > DDG;
  // OpenAI Images > Pollinations). Env-global so idempotent across turns.
  setWebSearchProvider(autoWebSearchProvider());
  // Image cascade (P8): Settings preference (stored defaults) first, then
  // turn-model capability, Gemini key, OpenAI key, keyless Pollinations,
  // illustrated placeholder. Availability is key-presence only — zero probes,
  // zero stalls. Server-side secrets are read directly; no protocol change.
  try {
    const stored = sharedProviderSecrets().read();
    setImageProvider(
      cascadeImageProvider(
        resolveImageLegs({
          preferred: stored.defaultImageProviderId ?? "auto",
          imageModel: stored.defaultImageModelId,
          turnProviderId: providerId,
          turnModelId: modelId,
        }),
      ),
    );
  } catch {
    setImageProvider(autoImageProvider());
  }

  if (input.mcpRegistry !== undefined) setMcpToolRegistry(input.mcpRegistry);
  if (input.dbLink) linkDatabase(input.sessionId, input.dbLink);

  // Donor isEnabled gates: DB tools only when a database is linked (session
  // link counts — settings-sync, turn link, and snapshot restores all funnel
  // through connections.ts, so getDatabaseLink is accurate at turn time),
  // per-provider info only for the linked provider, add_integration only
  // while unconnected, MCP search only with a registry. hasDbLink is always
  // explicit (donor hides DB tools from unconnected turns rather than
  // offering tools that fail at connection time). Sandbox/explorer flags
  // default open until their settings land (018/016).
  const turnDbLink = input.dbLink ?? getDatabaseLink(input.sessionId);
  // Donor managed-connection semantics (V1 keys off project IDs):
  // supabase needs a projectId; neon needs projectId + active branch.
  const hasManagedDbLink =
    turnDbLink?.provider === "supabase"
      ? turnDbLink.projectId != null
      : turnDbLink?.provider === "neon"
        ? turnDbLink.projectId != null && turnDbLink.branchId != null
        : false;
  const included = UNIFIED_DEFS.filter((def) =>
    shouldIncludeTool(
      def.name,
      {
        hasDbLink: turnDbLink != null,
        ...(turnDbLink ? { dbProvider: turnDbLink.provider ?? null } : {}),
        hasManagedDbLink,
        mcpSearchEnabled: input.mcpRegistry != null,
      },
      options,
      store,
    ),
  );

  const requestConsent: ConsentRequestFn = input.requestConsent ?? (async () => "decline" as const);

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
    async executeWithConsent(
      toolName: string,
      args: unknown,
      toolId: string,
      signal?: AbortSignal,
    ): Promise<unknown> {
      const def = included.find((d) => d.name === toolName);
      if (!def) throw new Error(`Tool not available this turn: ${toolName}`);
      assertAppBlueprintApproved(input.sessionId, toolName, !def.readOnly, {
        planningSpecific:
          PLANNING_SPECIFIC_TOOLS.has(toolName) || ALL_PLAN_TOOLS.some((t) => t.name === toolName),
        capabilityGated: CAPABILITY_GATED_BLUEPRINT_TOOLS.has(toolName),
      });
      const allowed = await requireAgentToolConsent({
        sessionId: input.sessionId,
        toolName,
        // Donor card parity: description + per-tool preview + SQL metadata.
        // Without metadata the safeSql setting is dead (auto-approve can
        // never fire); without previews every card shows bare args.
        toolDescription: def.description ?? null,
        inputPreview: presentToolCall(def, args),
        metadata: sqlMetadataForConsent(toolName, args),
        store,
        autoApproveNonSchemaSql: input.autoApproveNonSchemaSql,
        requestConsent,
        bypassConsent: consentBypass,
        toolArgs: args,
        ...(signal ? { signal } : {}),
      });
      if (!allowed) throw new Error(`Tool call declined: ${toolName}`);
      recordSessionToolCall(input.sessionId, toolName);
      // The 10-minute tool timeout must never kill a human wait: a parked
      // questionnaire waits as long as the user needs (an earlier build
      // auto-dismissed parked prompts at exactly 600s, zombifying the card).
      // Waiting tools get the caller's abort only — real cancel/steer still
      // unblocks via waitForUserInput's abort handling. Everything else gets
      // abort-or-budget, whichever fires first (per-tool timeoutMs, donor
      // run_command default 120s, else 600s).
      const budgetMs =
        def.timeoutMs && Number.isFinite(def.timeoutMs) && def.timeoutMs > 0
          ? Math.floor(def.timeoutMs)
          : 600_000;
      const toolSignal = def.waitsForUserInput
        ? (signal ?? new AbortController().signal)
        : signal
          ? AbortSignal.any([signal, AbortSignal.timeout(budgetMs)])
          : AbortSignal.timeout(budgetMs);
      return def.execute(args, {
        signal: toolSignal,
        appPath: input.appPath,
        sessionId: input.sessionId,
        toolId,
        ...(input.requestMcpConsent
          ? {
              // Full access answers MCP consent directly (stored "denied"
              // still blocks first inside requireMcpToolConsent).
              requestMcpConsent: consentBypass
                ? async () => "accept-always" as const
                : input.requestMcpConsent,
            }
          : {}),
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
