import { useState, useEffect, useSyncExternalStore } from "react";
import type { HarnessEvent } from "@caide/contracts";

export interface ToolCallEntry {
  id: string;
  name: string;
  args: unknown;
  status: "started" | "completed" | "failed";
  result?: unknown;
  durationMs?: number;
}

export interface CheckpointEntry {
  id: string;
  reason: string;
  requiresResponse: boolean;
  diff?: string;
}

export interface ArtifactEntry {
  path: string;
  framework: string;
  sizeBytes: number;
}

export interface UiPromptEntry {
  requestId: string;
  kind: "questionnaire" | "env-vars" | "integration" | "tool-consent" | "mcp-consent";
  payload: unknown;
}

export interface UiRevealEntry {
  pane: "database" | "preview";
  reason: string;
  at: number;
}

export interface PlanEntry {
  title: string;
  summary: string;
  plan: string;
  exited: boolean;
}

export interface BlueprintEntry {
  appName: string;
  userPrompt: string;
  framework?: string;
  designDirection: string;
  primaryColor: string;
  visuals: Array<{ type: string; description: string; prompt: string }>;
  approved: boolean;
}

export interface TodoEntry {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  ref?: string;
}

export interface VerifierEntry {
  passed: boolean;
  confidence: number;
  tasteScore: number;
  issues: string[];
}

export interface VersionEntry {
  hash: string;
  message: string;
  createdAt: number;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TimelineEntry {
  seq: number;
  kind: "token" | "tool" | "stage" | "checkpoint" | "error" | "artifact" | "user";
  id?: string;
  content?: string;
}

export interface SessionState {
  id: string;
  stage: string;
  tokens: string[];
  toolCalls: Record<string, ToolCallEntry>;
  checkpoint?: CheckpointEntry;
  artifacts: ArtifactEntry[];
  errors: Array<{ code: string; message: string }>;
  prompts: UiPromptEntry[];
  /** Typed-but-unsubmitted questionnaire answers by requestId. Survives
   * card remounts (reconnect replay); cleared on submit/dismiss/turn_end.
   * Never used for secrets (env-vars/integration drafts are not kept). */
  answerDrafts: Record<string, Record<string, string | string[]>>;
  reveals: UiRevealEntry[];
  plan?: PlanEntry;
  blueprint?: BlueprintEntry;
  todos: TodoEntry[];
  verifier?: VerifierEntry;
  versions: VersionEntry[];
  lastUsage?: TurnUsage;
  /** Live harness turn for this session (set on turn_start, cleared on turn_end). */
  liveTurnId?: string;
  timeline: TimelineEntry[];
  /** Diverted plain-text user turns (P0 send-path): echoed locally so the
   * harness transcript shows the user bubble without an orchestration turn. */
  userMessages: Record<string, string>;
}

let timelineSeq = 0;
const TIMELINE_CAP = 2000;

function pushTimeline(session: SessionState, entry: Omit<TimelineEntry, "seq">): void {
  session.timeline.push({ ...entry, seq: ++timelineSeq });
  if (session.timeline.length > TIMELINE_CAP) {
    session.timeline.splice(0, session.timeline.length - TIMELINE_CAP);
  }
}

export interface HarnessStoreState {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  /** Latest compaction outcome across sessions (settings status line). */
  lastCompaction: { at: number; reason: string; summaryLength: number } | null;
}

const listeners = new Set<() => void>();

let state: HarnessStoreState = {
  sessions: {},
  activeSessionId: null,
  lastCompaction: null,
};

function notify(): void {
  // Replace the root reference on every commit: mutators edit sessions in
  // place, so without a new root React's useState subscribers receive an
  // identical reference and bail out — the harness UI would never re-render
  // (no echo, no tokens, no errors) despite the store filling correctly.
  state = { ...state };
  for (const listener of listeners) {
    listener();
  }
}

function getOrCreateSession(sessionId: string): SessionState {
  if (!state.sessions[sessionId]) {
    state.sessions = {
      ...state.sessions,
      [sessionId]: {
        id: sessionId,
        stage: "idle",
        tokens: [],
        toolCalls: {},
        artifacts: [],
        errors: [],
        prompts: [],
        answerDrafts: {},
        reveals: [],
        todos: [],
        versions: [],
        timeline: [],
        userMessages: {},
      },
    };
  }
  return state.sessions[sessionId];
}

export const harnessStore = {
  getState: (): HarnessStoreState => state,

  setActiveSession: (sessionId: string | null): void => {
    state = { ...state, activeSessionId: sessionId };
    notify();
  },

  handleEvent: (event: HarnessEvent): void => {
    const session = getOrCreateSession(event.sessionId);

    switch (event.type) {
      case "turn_start": {
        state.sessions[event.sessionId] = { ...session, liveTurnId: event.turnId };
        break;
      }
      case "turn_end": {
        const ended: SessionState = { ...session, liveTurnId: undefined };
        // Zombie backstop: a live prompt means its turn is still running, so
        // at turn_end every waiter is settled — anything still rendered is an
        // orphan (e.g. settled by a path that never notified the client).
        // Settled prompts already carry withdrawal tombstones, so replay
        // stays clean. Drafts belong to settled prompts — drop them too.
        const cleared: SessionState = { ...ended, prompts: [], answerDrafts: {} };
        state.sessions[event.sessionId] = event.usage
          ? { ...cleared, lastUsage: { ...event.usage } }
          : cleared;
        break;
      }
      case "token": {
        const updatedTokens = [...session.tokens, event.content];
        state.sessions[event.sessionId] = { ...session, tokens: updatedTokens };
        pushTimeline(state.sessions[event.sessionId], { kind: "token", content: event.content });
        break;
      }
      case "stage": {
        state.sessions[event.sessionId] = { ...session, stage: event.to };
        break;
      }
      case "tool_call": {
        const updatedToolCalls = {
          ...session.toolCalls,
          [event.id]: {
            id: event.id,
            name: event.name,
            args: event.args,
            status: event.status,
            result: event.result,
            durationMs: event.durationMs,
          },
        };
        state.sessions[event.sessionId] = { ...session, toolCalls: updatedToolCalls };
        if (event.status === "started") {
          pushTimeline(state.sessions[event.sessionId], { kind: "tool", id: event.id });
        }
        break;
      }
      case "checkpoint": {
        state.sessions[event.sessionId] = {
          ...session,
          checkpoint: {
            id: event.id,
            reason: event.reason,
            requiresResponse: event.requiresResponse,
            diff: event.diff,
          },
        };
        pushTimeline(state.sessions[event.sessionId], { kind: "checkpoint", id: event.id });
        break;
      }
      case "artifact_updated": {
        const updatedArtifacts = [
          ...session.artifacts.filter((a) => a.path !== event.path),
          { path: event.path, framework: event.framework, sizeBytes: event.sizeBytes },
        ];
        state.sessions[event.sessionId] = { ...session, artifacts: updatedArtifacts };
        break;
      }
      case "error": {
        state.sessions[event.sessionId] = {
          ...session,
          errors: [...session.errors, { code: event.code, message: event.message }],
        };
        pushTimeline(state.sessions[event.sessionId], { kind: "error", content: event.message });
        break;
      }
      case "ui_prompt": {
        const prompts = session.prompts.some((p) => p.requestId === event.requestId)
          ? session.prompts
          : [
              ...session.prompts,
              { requestId: event.requestId, kind: event.kind, payload: event.payload },
            ];
        state.sessions[event.sessionId] = { ...session, prompts };
        break;
      }
      case "ui_prompt_withdraw": {
        // Superseded/cancelled prompt: drop the card (replay also skips it).
        // Checkpoint gates share the waiter id space, so a matching
        // checkpoint clears too.
        if (session.checkpoint && session.checkpoint.id === event.requestId) {
          const { checkpoint: _droppedCheckpoint, ...restCheckpoint } = session;
          void _droppedCheckpoint;
          state.sessions[event.sessionId] = {
            ...restCheckpoint,
            prompts: restCheckpoint.prompts.filter((p) => p.requestId !== event.requestId),
          };
          break;
        }
        if (!session.prompts.some((p) => p.requestId === event.requestId)) break;
        state.sessions[event.sessionId] = {
          ...session,
          prompts: session.prompts.filter((p) => p.requestId !== event.requestId),
        };
        break;
      }
      case "ui_reveal": {
        state.sessions[event.sessionId] = {
          ...session,
          reveals: [...session.reveals, { pane: event.pane, reason: event.reason, at: Date.now() }],
        };
        break;
      }
      case "plan_update": {
        state.sessions[event.sessionId] = {
          ...session,
          plan: { title: event.title, summary: event.summary, plan: event.plan, exited: false },
        };
        break;
      }
      case "plan_exit": {
        state.sessions[event.sessionId] = session.plan
          ? { ...session, plan: { ...session.plan, exited: true } }
          : session;
        break;
      }
      case "blueprint_update": {
        state.sessions[event.sessionId] = {
          ...session,
          blueprint: {
            appName: event.appName,
            userPrompt: event.userPrompt,
            framework: event.framework,
            designDirection: event.designDirection,
            primaryColor: event.primaryColor,
            visuals: event.visuals,
            approved: false,
          },
        };
        break;
      }
      case "todos_update": {
        state.sessions[event.sessionId] = {
          ...session,
          todos: event.todos.map((t) => ({
            id: t.id,
            content: t.content,
            status: t.status,
            ...(t.ref ? { ref: t.ref } : {}),
          })),
        };
        break;
      }
      case "compaction": {
        state = {
          ...state,
          lastCompaction: {
            at: Date.now(),
            reason: event.reason,
            summaryLength: event.summaryLength,
          },
        };
        break;
      }
      case "versions_state": {
        state.sessions[event.sessionId] = {
          ...session,
          versions: event.versions.map((v) => ({
            hash: v.hash,
            message: v.message,
            createdAt: v.createdAt,
          })),
        };
        break;
      }
      case "verifier_result": {
        state.sessions[event.sessionId] = {
          ...session,
          verifier: {
            passed: event.passed,
            confidence: event.confidence,
            tasteScore: event.tasteScore,
            issues: [...event.issues],
          },
        };
        break;
      }
    }

    notify();
  },

  /** Force-clear a stuck live-turn flag (Stop with no turn_end arriving).
   * Prompts are left alone — the server withdraw broadcast (or replay)
   * settles the cards; this only unlatches the stop control. */
  clearLiveTurn: (sessionId: string): void => {
    const session = state.sessions[sessionId];
    if (!session || session.liveTurnId === undefined) return;
    const { liveTurnId: _droppedLive, ...rest } = session;
    void _droppedLive;
    state.sessions[sessionId] = rest;
    notify();
  },

  /** Remove a delivered prompt (answered/dismissed in UI). */
  resolvePrompt: (sessionId: string, requestId: string): void => {
    const session = state.sessions[sessionId];
    if (!session) return;
    const { [requestId]: _droppedDraft, ...restDrafts } = session.answerDrafts;
    void _droppedDraft;
    state.sessions[sessionId] = {
      ...session,
      prompts: session.prompts.filter((p) => p.requestId !== requestId),
      answerDrafts: restDrafts,
    };
    notify();
  },

  /** Stash typed-but-unsubmitted questionnaire answers (survive remounts). */
  setAnswerDraft: (
    sessionId: string,
    requestId: string,
    answers: Record<string, string | string[]>,
  ): void => {
    const session = getOrCreateSession(sessionId);
    state.sessions[sessionId] = {
      ...session,
      answerDrafts: { ...session.answerDrafts, [requestId]: answers },
    };
    notify();
  },

  /**
   * Drop an acted-on approval gate (plan/blueprint/checkpoint). Local acted
   * flags reset on remount, so without this an answered gate resurrects on
   * thread switch. plan_update/blueprint_update/checkpoint events are not
   * persisted, so clearing is replay-safe (a genuinely new gate re-adds).
   */
  resolvePlan: (sessionId: string): void => {
    const session = state.sessions[sessionId];
    if (!session || !session.plan) return;
    const { plan: _droppedPlan, ...rest } = session;
    void _droppedPlan;
    state.sessions[sessionId] = rest;
    notify();
  },

  resolveBlueprint: (sessionId: string): void => {
    const session = state.sessions[sessionId];
    if (!session || !session.blueprint) return;
    const { blueprint: _droppedBlueprint, ...rest } = session;
    void _droppedBlueprint;
    state.sessions[sessionId] = rest;
    notify();
  },

  resolveCheckpoint: (sessionId: string): void => {
    const session = state.sessions[sessionId];
    if (!session || !session.checkpoint) return;
    const { checkpoint: _droppedCheckpoint, ...rest } = session;
    void _droppedCheckpoint;
    state.sessions[sessionId] = rest;
    notify();
  },

  clearSession: (sessionId: string): void => {
    const nextSessions = { ...state.sessions };
    delete nextSessions[sessionId];
    state = { ...state, sessions: nextSessions };
    notify();
  },

  /** Local echo for a diverted plain-text user turn (P0 send-path). Pushes a
   * `user` timeline entry so HarnessTranscript renders the bubble; the id is
   * `u<seq>`-namespaced so it can never collide with server tool/checkpoint ids. */
  appendUserMessage: (sessionId: string, messageId: string, text: string): void => {
    const session = getOrCreateSession(sessionId);
    const id = `u-${messageId}`;
    state.sessions[sessionId] = {
      ...session,
      userMessages: { ...session.userMessages, [id]: text },
    };
    pushTimeline(state.sessions[sessionId], { kind: "user", id, content: text });
    notify();
  },

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useHarnessStore(): HarnessStoreState {
  const [current, setCurrent] = useState(harnessStore.getState());

  useEffect(() => {
    return harnessStore.subscribe(() => {
      setCurrent(harnessStore.getState());
    });
  }, []);

  return current;
}

/**
 * Whether a harness turn is currently live for a session. Scoped to the
 * turn lifecycle (turn_start → turn_end), unlike message streaming flags
 * which can go stale — use this (not messages.some(streaming)) to decide
 * stop-button visibility.
 */
export function useHarnessTurnLive(sessionId: string | null | undefined): boolean {
  return useSyncExternalStore(
    harnessStore.subscribe,
    () => sessionId != null && harnessStore.getState().sessions[sessionId]?.liveTurnId != null,
  );
}
