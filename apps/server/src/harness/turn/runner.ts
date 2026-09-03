// FILE: runner.ts
// Purpose: CaideRunner — real turn lifecycle owner (created→running→
// waiting→terminal). Replaces the token-placeholder stub: per turn it builds
// the turn context (provider/tools/consent), assembles the Dyad system prompt
// for the mode + framework, streams the harness loop over the provider
// adapter, and forwards typed HarnessEvents. One AbortController per session.

import type { HarnessEvent } from "@caide/contracts";
import { createStreamProviderAdapter } from "../provider/streamProviderAdapter.ts";
import { runLoop, type LLMAdapter } from "../loop/loop.ts";
import { Inbox } from "../inbox/index.ts";
import { buildConversationChain, buildMessages } from "../session/buildChain.ts";
import { SessionStorage } from "../session/storage.ts";
import { constructSystemPrompt } from "../../dyad/prompts/index.ts";
import type { CaideFramework } from "../../dyad/prompts/index.ts";
import { shouldRevealDatabasePanel } from "../../dyad/db/dbPanel.ts";
import type { SettingsLike } from "../../dyad/providers/index.ts";
import type { ConsentRequestFn } from "../../dyad/tools/index.ts";
import { createTurnContext } from "./turnContext.ts";
import {
  getOrCreateSessionStores,
  restoreSessionState,
  snapshotSessionState,
} from "./sessionStores.ts";
import { TurnFlow, type TurnStatus } from "./index.ts";

export type RunnerStatus = TurnStatus;
export type ChatMode = "build" | "ask" | "agent" | "plan";

export interface StartTurnInput {
  sessionId: string;
  appPath: string;
  prompt: string;
  mode?: ChatMode;
  framework?: CaideFramework;
  settings?: SettingsLike;
  providerId?: string;
  modelId?: string;
  requestConsent?: ConsentRequestFn;
  autoApproveNonSchemaSql?: boolean;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: HarnessEvent) => void;
  /** Test seam: bypass provider streaming. */
  llmOverride?: LLMAdapter;
  /** Per-session inbox for steering a running turn (gateway-owned). */
  inbox?: Inbox;
}

function chatModeFor(mode: ChatMode): "build" | "ask" | "local-agent" | "plan" {
  if (mode === "agent") return "local-agent";
  return mode;
}

export class CaideRunner {
  private flow = new TurnFlow();
  private status: RunnerStatus = "created";
  private listeners: ((ev: RunnerEvent) => void)[] = [];
  private controllers = new Map<string, AbortController>();

  onEvent(listener: (ev: RunnerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(ev: RunnerEvent): void {
    for (const l of this.listeners) l(ev);
  }

  cancel(sessionId: string, cause = "cancelled"): void {
    this.controllers.get(sessionId)?.abort(cause);
  }

  getStatus(): RunnerStatus {
    return this.status;
  }

  async startTurn(input: StartTurnInput): Promise<string> {
    const turnId = this.flow.launch(input.prompt);
    this.status = "running";
    const forward = (event: HarnessEvent): void => {
      input.onEvent?.(event);
      if (event.type === "token") this.emit({ type: "token", content: event.content });
      else if (event.type === "tool_call") {
        this.emit({
          type: "tool_call",
          name: event.name,
          status: event.status === "started" ? "started" : event.status === "failed" ? "failed" : "completed",
        });
        // Autonomous pane control: DB work reveals the database pane, preview
        // tools reveal the preview pane — the agent never asks the user to open them.
        if (event.status === "started") {
          if (shouldRevealDatabasePanel(event.name)) {
            const reveal: HarnessEvent = {
              type: "ui_reveal",
              sessionId: input.sessionId,
              pane: "database",
              reason: event.name,
            };
            input.onEvent?.(reveal);
          } else if (event.name === "open_preview" || event.name === "restart_preview") {
            const reveal: HarnessEvent = {
              type: "ui_reveal",
              sessionId: input.sessionId,
              pane: "preview",
              reason: event.name,
            };
            input.onEvent?.(reveal);
          }
        }
      } else if (event.type === "stage") this.emit({ type: "stage", from: event.from, to: event.to });
      else if (event.type === "checkpoint") this.emit({ type: "checkpoint", requiresResponse: event.requiresResponse });
      else if (event.type === "artifact_updated") this.emit({ type: "artifact_updated", path: event.path });
    };
    forward({ type: "turn_start", sessionId: input.sessionId, turnId, prompt: input.prompt });

    const controller = new AbortController();
    this.controllers.set(input.sessionId, controller);
    const onAbort = () => controller.abort(input.signal?.reason ?? "cancelled");
    input.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const storage = new SessionStorage();
      await restoreSessionState(input.sessionId, storage).catch(() => {});
      const sessionStores = getOrCreateSessionStores(input.sessionId);
      const ctx = createTurnContext({
        sessionId: input.sessionId,
        appPath: input.appPath,
        framework: input.framework,
        settings: input.settings,
        providerId: input.providerId,
        modelId: input.modelId,
        requestConsent: input.requestConsent,
        autoApproveNonSchemaSql: input.autoApproveNonSchemaSql ?? sessionStores.safeSql,
        store: sessionStores.consent,
      });
      const chatMode = chatModeFor(input.mode ?? "agent");
      const system = constructSystemPrompt({
        aiRules: undefined,
        chatMode,
        enableTurboEditsV2: false,
        caideFramework: input.framework,
      });
      const llm =
        input.llmOverride ??
        createStreamProviderAdapter(
          {
            modelId: ctx.provider.modelId,
            baseUrl: ctx.provider.baseUrl,
            apiKey: ctx.provider.apiKey ?? "",
            system,
            appPath: input.appPath,
          },
          ctx.tools,
        );

      const stream = runLoop({
        sessionId: input.sessionId,
        turnId,
        maxSteps: input.maxSteps ?? 25,
        signal: controller.signal,
        inbox: input.inbox,
        llm,
        buildMessages: async () => {
          const chain = await buildConversationChain(input.sessionId, undefined, storage);
          const history = buildMessages(chain, { role: "builder", includeSystem: false });
          return [
            { role: "system", content: system },
            ...history,
            { role: "user", content: input.prompt },
          ];
        },
        tools: ctx.tools.map((t) => ({
          name: t.name,
          description: t.description,
          readOnly: t.readOnly,
          timeoutMs: t.timeoutMs,
          execute: (args, c) =>
            ctx.executeWithConsent(t.name, args, c.toolId) as Promise<unknown>,
        })),
        onEvent: forward,
        role: "builder",
      });
      for await (const event of stream) {
        void event;
      }

      if (controller.signal.aborted) {
        this.status = "cancelled";
        forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "cancelled" });
      } else {
        this.status = "completed";
        forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "completed" });
      }
      await snapshotSessionState(input.sessionId, storage).catch(() => {});
      ctx.cleanup();
    } catch (err) {
      this.status = "failed";
      forward({
        type: "error",
        sessionId: input.sessionId,
        code: "TURN_FAILED",
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      });
      forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "failed" });
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
      this.controllers.delete(input.sessionId);
    }
    return turnId;
  }
}

export type RunnerEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; status: "started" | "completed" | "failed" }
  | { type: "stage"; from: string; to: string }
  | { type: "checkpoint"; requiresResponse: boolean }
  | { type: "artifact_updated"; path: string };
