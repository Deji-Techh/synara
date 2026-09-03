// FILE: uiBridge.test.ts
// Purpose: M3 gate — bridge emits typed UI events and routes answers into
// the waiter registries (fake WS server, no sockets).

import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import { getDbPanelTransport, requestDatabasePanel, setDbPanelTransport } from "../../dyad/db/dbPanel.ts";
import { getPlanTransport, setPlanTransport } from "../../dyad/plan/planTools.ts";
import { resolveUserInput, waitForUserInput } from "../../dyad/plan/userPrompt.ts";
import { resolveConsent, waitForConsent } from "../../dyad/tools/permissions.ts";
import { attachUiBridge } from "./uiBridge.ts";
import type { HarnessWebSocketServer } from "./server.ts";

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
  } as unknown as HarnessWebSocketServer;
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
    const { handlers, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      const waiting = waitForUserInput("r-qa", "s", "questionnaire");
      (handlers.prompt as (id: string, answers: Record<string, string> | null) => void)("r-qa", {
        q1: "A",
      });
      await expect(waiting).resolves.toEqual({ q1: "A" });

      const dismissed = waitForUserInput("r-dismiss", "s", "env-vars");
      (handlers.prompt as (id: string, answers: Record<string, string> | null) => void)(
        "r-dismiss",
        null,
      );
      await expect(dismissed).resolves.toBeNull();
      void resolveUserInput;
    } finally {
      bridge.detach();
      setPlanTransport(null);
    }
  });

  it("routes consent answers into both consent registries", async () => {
    const { handlers, server } = fakeServer();
    const bridge = attachUiBridge(server);
    try {
      const tool = waitForConsent("r-tool", "s");
      const mcp = waitForConsent("r-mcp", "s");
      void mcp;
      (handlers.consent as (id: string, d: "accept-once") => void)("r-tool", "accept-once");
      await expect(tool).resolves.toBe("accept-once");
      void resolveConsent;
    } finally {
      bridge.detach();
    }
  });
});
