// FILE: src/agent/agentLoop.ts
// Purpose: The engine's agent loop (M2: no tools). Rebuilt from dyad x caide's
// local_agent_handler pattern but on the AI SDK's streamText with an
// OpenAI-compatible provider (decision F: user API keys + arbitrary base URL).
// Layer: Engine agent core

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type LanguageModelV4 } from "ai";

export interface EngineModelConfig {
  /** Base URL of the OpenAI-compatible endpoint, e.g. http://127.0.0.1:PORT/v1 */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
}

export interface AgentMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface RunTurnOptions {
  readonly abortSignal?: AbortSignal;
  /** Called for each text delta as it streams (for transcript piping later). */
  readonly onTextDelta?: (delta: string) => void;
}

export interface TurnResult {
  readonly text: string;
  readonly usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Full conversation after this turn (user + assistant appended). */
  readonly history: readonly AgentMessage[];
}

export interface AgentOptions {
  readonly model: EngineModelConfig;
  readonly systemPrompt?: string;
  readonly initialHistory?: readonly AgentMessage[];
}

export class Agent {
  private readonly model: LanguageModelV4;
  private readonly history: AgentMessage[];

  constructor(readonly options: AgentOptions) {
    const provider = createOpenAICompatible({
      name: "synara-engine",
      baseURL: options.model.baseUrl,
      apiKey: options.model.apiKey,
    });
    this.model = provider.chatModel(options.model.modelId);
    this.history = [...(options.initialHistory ?? [])];
  }

  get conversation(): readonly AgentMessage[] {
    return this.history;
  }

  async runTurn(userMessage: string, opts: RunTurnOptions = {}): Promise<TurnResult> {
    const result = streamText({
      model: this.model,
      system: this.options.systemPrompt,
      messages: [
        ...this.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user" as const, content: userMessage },
      ],
      abortSignal: opts.abortSignal,
    });

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      opts.onTextDelta?.(delta);
    }

    const usage = await result.usage;
    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: text });

    return {
      text,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
      history: this.history,
    };
  }
}