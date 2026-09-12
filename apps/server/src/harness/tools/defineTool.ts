import { z } from "zod";
import type { McpConsentRequestFn } from "../../dyad/mcp/mcpConsent.ts";
import type { ConsentRequestFn, ConsentStore } from "../../dyad/tools/permissions.ts";

export interface ToolContext {
  signal: AbortSignal;
  appPath: string;
  sessionId: string;
  toolId: string;
  stage?: string;
  role?: string;
  /** Provider config the tool can use to spawn its own LLM calls (e.g. sub-agents). */
  provider?: { modelId: string; baseUrl: string; apiKey: string; system?: string };
  /** MCP consent round-trip (sandbox host calls); absent → stored-consent only. */
  requestMcpConsent?: McpConsentRequestFn;
  /**
   * Agent tool-consent round-trip + store, threaded by the loop from turn
   * options. Lets delegated tools (subagents) enforce the same per-tool
   * ask/always/never posture as the parent turn. Absent → no extra gating.
   */
  requestConsent?: ConsentRequestFn;
  consentStore?: ConsentStore;
}

export interface ToolDef<I = any, O = any> {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  readOnly: boolean;
  modifiesState: boolean;
  allowedStages?: readonly string[];
  allowedRoles?: readonly string[];
  timeoutMs?: number;
  /**
   * The tool parks waiting for user input (questionnaires, approvals).
   * The loop must not apply its execution budget to these — humans always
   * take longer than 30s. Cancellation still unblocks via abort signal.
   */
  waitsForUserInput?: boolean;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
  presentCall?: (input: I) => string;
  presentResult?: (output: O) => string;
}

export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}
