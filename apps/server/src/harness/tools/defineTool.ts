import { z } from "zod";
import type { McpConsentRequestFn } from "../../dyad/mcp/mcpConsent.ts";

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
  execute: (input: I, ctx: ToolContext) => Promise<O>;
  presentCall?: (input: I) => string;
  presentResult?: (output: O) => string;
}

export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}
