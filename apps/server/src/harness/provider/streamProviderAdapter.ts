// FILE: streamProviderAdapter.ts
// Bridges the harness loop's LLMAdapter interface to the live streamProvider
// (real provider streaming) plus the core tool definitions. This is what makes
// the agent tree (loop → builder → tools) actually reachable from a turn.
import { z } from "zod";

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

export function cleanJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return { type: "object", properties: {} };
  try {
    const raw = z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>;
    const { $schema, "~standard": _std, ...clean } = raw;
    return clean;
  } catch {
    return { type: "object", properties: {} };
  }
}

/** Formats the tool schemas for the provider's endpoint dialect. */
export function providerToolsFor(tools: ToolDef[], modelId: string, baseUrl: string): unknown[] {
  const endpoint = endpointForModel(modelId, baseUrl);
  return tools.map((tool) => {
    const parameters = cleanJsonSchema(tool.schema);
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
    if (endpoint === "gemini") {
      return {
        name: tool.name,
        description: tool.description,
        parameters,
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

export function formatChatMessagesForEndpoint(
  messages: ChatMessage[],
  endpoint: ReturnType<typeof endpointForModel>,
): unknown[] {
  const nonSystem = messages.filter((m: any) => m.role !== "system");

  if (endpoint === "responses") {
    const items: unknown[] = [];
    for (const m of nonSystem as any[]) {
      if (m.role === "assistant") {
        if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          if (m.content) items.push({ role: "assistant", content: m.content });
          for (const tc of m.tool_calls) {
            items.push({
              type: "function_call",
              call_id: tc.id || tc.call_id || "call_1",
              name: tc.function?.name || tc.name || "",
              arguments:
                typeof tc.function?.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments ?? tc.args ?? {}),
            });
          }
        } else {
          items.push({
            role: "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
          });
        }
      } else if (m.role === "tool") {
        items.push({
          type: "function_call_output",
          call_id: m.tool_call_id || "call_1",
          output: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        });
      } else {
        items.push({
          role: "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        });
      }
    }
    return items;
  }

  if (endpoint === "messages") {
    const items: unknown[] = [];
    for (const m of nonSystem as any[]) {
      if (m.role === "assistant") {
        if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          const contentParts: unknown[] = [];
          if (m.content) {
            contentParts.push({ type: "text", text: m.content });
          }
          for (const tc of m.tool_calls) {
            let parsedArgs: Record<string, unknown> = {};
            const rawArgs = tc.function?.arguments ?? tc.args;
            if (typeof rawArgs === "string") {
              try {
                parsedArgs = JSON.parse(rawArgs);
              } catch {
                parsedArgs = { raw: rawArgs };
              }
            } else if (typeof rawArgs === "object" && rawArgs !== null) {
              parsedArgs = rawArgs;
            }
            contentParts.push({
              type: "tool_use",
              id: tc.id || tc.call_id || `call-${Date.now()}`,
              name: tc.function?.name || tc.name || "",
              input: parsedArgs,
            });
          }
          items.push({ role: "assistant", content: contentParts });
        } else {
          items.push({
            role: "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
          });
        }
      } else if (m.role === "tool") {
        items.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id || "call_1",
              content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
            },
          ],
        });
      } else {
        items.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        });
      }
    }
    return items;
  }

  // Default: chat/completions and gemini
  return nonSystem.map((m: any) => {
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content ?? null,
        tool_calls: m.tool_calls,
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      };
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
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

  const endpoint = endpointForModel(opts.modelId, opts.baseUrl);
  const providerTools = providerToolsFor(tools, opts.modelId, opts.baseUrl);

  return {
    async *stream(
      messages: ChatMessage[],
      options?: { tools?: ToolDefinition[]; signal?: AbortSignal },
    ) {
      const chat = formatChatMessagesForEndpoint(messages, endpoint);

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
      parameters: cleanJsonSchema(tool.schema),
    },
  }));
}
