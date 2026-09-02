// FILE: streamProviderAdapter.ts
// Bridges the harness loop's LLMAdapter interface to the live streamProvider
// (real provider streaming) plus the core tool definitions. This is what makes
// the agent tree (loop → builder → tools) actually reachable from a turn.
import { zodToJsonSchema } from "zod-to-json-schema";

import type { LLMAdapter, ToolDefinition } from "../loop/loop.ts";
import type { ChatMessage } from "../session/buildChain.ts";
import type { ToolDef } from "../tools/defineTool.ts";
import { endpointForModel, streamProvider } from "./apiAdapter.ts";

export interface StreamProviderAdapterOptions {
  modelId: string;
  baseUrl: string;
  apiKey: string;
  system?: string;
  /** Workspace root the tools operate on (passed into every tool context). */
  appPath: string;
}

/** Formats the tool schemas for the provider's endpoint dialect. */
export function providerToolsFor(tools: ToolDef[], modelId: string, baseUrl: string): unknown[] {
  const endpoint = endpointForModel(modelId, baseUrl);
  return tools.map((tool) => {
    const parameters = zodToJsonSchema(tool.schema as never, tool.name) as Record<string, unknown>;
    if (endpoint === "responses") {
      // OpenAI Responses API: name/description/parameters at the top level.
      return {
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters,
      };
    }
    if (endpoint === "messages") {
      // Anthropic: input_schema, no `type`.
      return {
        name: tool.name,
        description: tool.description,
        input_schema: parameters,
      };
    }
    // chat/completions (and default): nested under `function`.
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}

/**
 * Builds an LLMAdapter bound to a provider endpoint + a tool set. The returned
 * adapter sends the tool schemas (zod → JSON Schema) so the model can emit tool
 * calls, and translates the provider stream into the loop's token/tool_call
 * chunks.
 */
export function createStreamProviderAdapter(
  opts: StreamProviderAdapterOptions,
  tools: ToolDef[],
): LLMAdapter {
  const toolList: ToolDefinition[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    readOnly: tool.readOnly,
    execute: (args, ctx) =>
      tool.execute(args, {
        signal: ctx.signal,
        appPath: opts.appPath,
        sessionId: ctx.sessionId,
        toolId: ctx.toolId,
      }),
  }));

  const providerTools = providerToolsFor(tools, opts.modelId, opts.baseUrl);

  return {
    async *stream(
      messages: ChatMessage[],
      options?: { tools?: ToolDefinition[]; signal?: AbortSignal },
    ) {
      const chat = messages
        .filter((m) => m.role !== "system") // system rides the `system` option
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

      const providerOpts: Record<string, unknown> = {
        modelId: opts.modelId,
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        messages: chat,
        tools: providerTools,
      };
      if (opts.system) providerOpts.system = opts.system;
      if (options?.signal) providerOpts.signal = options.signal;
      const provider = streamProvider(providerOpts as Parameters<typeof streamProvider>[0]);

      for await (const chunk of provider) {
        if (chunk.type === "token" && chunk.content) {
          yield { type: "token", content: chunk.content };
        } else if (
          chunk.type === "tool_call" &&
          chunk.toolCall &&
          chunk.toolCall.name &&
          chunk.toolCall.name.trim().length > 0
        ) {
          yield {
            type: "tool_call",
            toolCall: {
              id: chunk.toolCall.id,
              name: chunk.toolCall.name,
              args: chunk.toolCall.args,
            },
          };
        }
        // Tool calls with an empty name are malformed (the model wrote them as
        // text) — skip them so the loop doesn't burn steps on unknown tools.
      }
    },
  };
}

export { toolListToDefinitions, providerToolSchemas };

// Convert ToolDef[] into the loop's simpler ToolDefinition[] (used when the
// caller wants the loop to execute tools but the adapter to list them).
function toolListToDefinitions(tools: ToolDef[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    readOnly: tool.readOnly,
    execute: (args, ctx) =>
      tool.execute(args, {
        signal: ctx.signal,
        appPath: "",
        sessionId: ctx.sessionId,
        toolId: ctx.toolId,
      }),
  }));
}

function providerToolSchemas(tools: ToolDef[]): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema, tool.name) as Record<string, unknown>,
    },
  }));
}
