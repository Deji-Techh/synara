import type { SystemModelMessage, Tool } from "@ai-sdk/provider-utils";
import type { ToolSet } from "ai";

const ANTHROPIC_CACHE_BREAKPOINT = { type: "ephemeral" } as const;

export function isAnthropicProvider(
  builtinProviderId: string | undefined,
): boolean {
  return builtinProviderId === "anthropic";
}

/**
 * Wraps a system prompt into a `SystemModelMessage[]` carrying an explicit
 * Anthropic cache breakpoint (`cache_control`) so the (mostly static) system
 * prompt prefix is cached across requests. Returns the prompt unchanged for
 * providers without explicit cache breakpoint support.
 */
export function withSystemCacheBreakpoint(
  systemPrompt: string | undefined,
  builtinProviderId: string | undefined,
): string | SystemModelMessage[] | undefined {
  if (!systemPrompt || !isAnthropicProvider(builtinProviderId)) {
    return systemPrompt;
  }
  return [
    {
      role: "system",
      content: systemPrompt,
      providerOptions: {
        anthropic: { cacheControl: ANTHROPIC_CACHE_BREAKPOINT },
      },
    },
  ];
}

/**
 * Adds an explicit Anthropic cache breakpoint to the LAST tool in the tool set,
 * which makes the whole tool list cacheable (Anthropic caches all tool
 * definitions up to the last breakpoint). Returns the tool set unchanged for
 * providers without explicit cache breakpoint support or when the tool set has
 * no plain-object tools to annotate.
 */
export function withToolCacheBreakpoint(
  tools: ToolSet | undefined,
  builtinProviderId: string | undefined,
): ToolSet | undefined {
  if (!tools || !isAnthropicProvider(builtinProviderId)) {
    return tools;
  }
  const names = Object.keys(tools);
  if (names.length === 0) {
    return tools;
  }
  const lastName = names[names.length - 1];
  const lastTool = tools[lastName];
  if (typeof lastTool !== "object" || lastTool === null) {
    return tools;
  }
  const annotatedTool: Tool = {
    ...lastTool,
    providerOptions: {
      ...lastTool.providerOptions,
      anthropic: { cacheControl: ANTHROPIC_CACHE_BREAKPOINT },
    },
  };
  return {
    ...tools,
    [lastName]: annotatedTool,
  };
}
