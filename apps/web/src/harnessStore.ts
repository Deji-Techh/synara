import { useState, useEffect } from "react";
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

export interface SessionState {
  id: string;
  stage: string;
  tokens: string[];
  toolCalls: Record<string, ToolCallEntry>;
  checkpoint?: CheckpointEntry;
  artifacts: ArtifactEntry[];
  errors: Array<{ code: string; message: string }>;
  prompts: UiPromptEntry[];
  reveals: UiRevealEntry[];
  plan?: PlanEntry;
}

export interface HarnessStoreState {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
}

const listeners = new Set<() => void>();

let state: HarnessStoreState = {
  sessions: {},
  activeSessionId: null,
};

function notify(): void {
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
        reveals: [],
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
      case "token": {
        const updatedTokens = [...session.tokens, event.content];
        state.sessions[event.sessionId] = { ...session, tokens: updatedTokens };
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
    }

    notify();
  },

  /** Remove a delivered prompt (answered/dismissed in UI). */
  resolvePrompt: (sessionId: string, requestId: string): void => {
    const session = state.sessions[sessionId];
    if (!session) return;
    state.sessions[sessionId] = {
      ...session,
      prompts: session.prompts.filter((p) => p.requestId !== requestId),
    };
    notify();
  },

  clearSession: (sessionId: string): void => {
    const nextSessions = { ...state.sessions };
    delete nextSessions[sessionId];
    state = { ...state, sessions: nextSessions };
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
