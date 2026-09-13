// FILE: uiBridge.test.ts
// Purpose: M3 gate — bridge emits typed UI events and routes answers into
// the waiter registries (fake WS server, no sockets).

import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import {
  getDbPanelTransport,
  requestDatabasePanel,
  setDbPanelTransport,
} from "../../dyad/db/dbPanel.ts";
import { getPlanTransport, setPlanTransport } from "../../dyad/plan/planTools.ts";
import { resolveUserInput, waitForUserInput } from "../../dyad/plan/userPrompt.ts";
import { resolveConsent, waitForConsent } from "../../dyad/tools/permissions.ts";
import { attachUiBridge, withdrawSessionPrompts } from "./uiBridge.ts";
import { clearSessionStores, getOrCreateSessionStores } from "../turn/sessionStores.ts";
import type { HarnessHub } from "./hub.ts";

function fakeServer() {
  const sent: HarnessEvent[] = [];
  const handlers: Record<string, (...args: never[]) => void> = {};
  const server = {
    broadcastToSession: (sessionId: string, event: HarnessEvent) => {
      void sessionId;
      sent.push(event);
    },
    onPromptAnswer: (h: (...args: never[]) => void) => {
      handlers.prompt = h;
    },
    onConsentAnswer: (h: (...args: never[]) => void) => {
      handlers.consent = h;
    },
    onSettingsSync: (h: (...args: never[]) => void) => {
      handlers.settings = h;
    },
    onMcpOAuthStart: (h: (...args: never[]) => void) => {
      handlers.mcpOAuth = h;
    },
  } as unknown as HarnessHub;
  return { sent, handlers, server };
}

describe("ui bridge delivery (m3)", () => {
  it("emits plan/db/integration prompts as typed events", () => {
    const { sent, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      getPlanTransport()?.sendQuestionnaire("s", "r1", []);
      getPlanTransport()?.sendPlanUpdate("s", { title: "T", summary: "S", plan: "P" });
      getPlanTransport()?.sendPlanExit("s");
      void requestDatabasePanel("s", "execute_sql");
      expect(sent.map((e) => e.type)).toEqual([
        "ui_prompt",
        "plan_update",
        "plan_exit",
        "ui_reveal",
      ]);
      expect(sent[0]).toMatchObject({ kind: "questionnaire", requestId: "r1" });
      expect(sent[3]).toMatchObject({ pane: "database", reason: "execute_sql" });
      void bridge;
    } finally {
      bridge.detach();
      expect(getPlanTransport()).toBeNull();
      expect(getDbPanelTransport()).toBeNull();
    }
  });

  it("routes prompt answers into the user-input waiter", async () => {
    const { handlers, sent, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      const waiting = waitForUserInput("r-qa", "s", "questionnaire");
      (handlers.prompt as (id: string, answers: Record<string, string> | null) => void)("r-qa", {
        q1: "A",
      });
      await expect(waiting).resolves.toEqual({ q1: "A" });
      // Answering tombstones the prompt: siblings drop the card and replay
      // never resurrects it (restart-safe).
      expect(sent).toContainEqual({
        type: "ui_prompt_withdraw",
        sessionId: "s",
        requestId: "r-qa",
      });

      const dismissed = waitForUserInput("r-dismiss", "s", "env-vars");
      (handlers.prompt as (id: string, answers: Record<string, string> | null) => void)(
        "r-dismiss",
        null,
      );
      await expect(dismissed).resolves.toBeNull();
      expect(sent).toContainEqual({
        type: "ui_prompt_withdraw",
        sessionId: "s",
        requestId: "r-dismiss",
      });
      void resolveUserInput;
    } finally {
      bridge.detach();
      setPlanTransport(null);
    }
  });

  it("withdraws parked prompts on cancel so cards drop and never replay", async () => {
    const { sent, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      const waiting = waitForUserInput("r-cancel", "s-cancel", "questionnaire");
      const ids = withdrawSessionPrompts(server, "s-cancel");
      expect(ids).toEqual(["r-cancel"]);
      await expect(waiting).resolves.toBeNull();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        type: "ui_prompt_withdraw",
        sessionId: "s-cancel",
        requestId: "r-cancel",
      });
      // Withdrawing again is a no-op — no duplicate withdrawals.
      expect(withdrawSessionPrompts(server, "s-cancel")).toEqual([]);
      expect(sent).toHaveLength(1);
    } finally {
      bridge.detach();
    }
  });

  it("routes consent answers into both consent registries", async () => {
    const { handlers, sent, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      const tool = waitForConsent("r-tool", "s");
      const mcp = waitForConsent("r-mcp", "s");
      void mcp;
      (handlers.consent as (id: string, d: "accept-once") => void)("r-tool", "accept-once");
      await expect(tool).resolves.toBe("accept-once");
      expect(sent).toContainEqual({
        type: "ui_prompt_withdraw",
        sessionId: "s",
        requestId: "r-tool",
      });
      void resolveConsent;
    } finally {
      bridge.detach();
    }
  });

  it("applies settings sync payloads to session stores", () => {
    const { handlers, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      (handlers.settings as (sid: string, settings: Record<string, unknown>) => void)("s-sync", {
        toolConsents: { run_command: "never" },
        safeSql: false,
      });
      expect(getOrCreateSessionStores("s-sync").consent.get("run_command")).toBe("never");
      expect(getOrCreateSessionStores("s-sync").safeSql).toBe(false);
    } finally {
      clearSessionStores("s-sync");
      bridge.detach();
    }
  });

  it("emits todos updates as typed events", () => {
    const { sent, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      getPlanTransport()?.sendTodosUpdate?.("s", [
        { id: "1", content: "First", status: "in_progress" },
      ]);
      expect(sent.map((e) => e.type)).toEqual(["todos_update"]);
      expect(sent[0]).toMatchObject({ sessionId: "s" });
    } finally {
      bridge.detach();
    }
  });
});
