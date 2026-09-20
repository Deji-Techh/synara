// FILE: turnContext.test.ts
// Purpose: M3 gate — turn assembly: provider auto/explicit, framework
// detection, unified tool filtering, consent-gated execution, UI routing.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  allUnifiedToolDefs,
  createTurnContext,
  detectFrameworkFromDisk,
  detectWeb3App,
} from "./turnContext.ts";
import { linkDatabase, unlinkDatabase } from "../../dyad/db/index.ts";

describe("turn context wire (m3)", () => {
  it("detects frameworks from workspace files", async () => {
    const flutter = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(path.join(flutter, "pubspec.yaml"), "name: x\n");
    await expect(detectFrameworkFromDisk(flutter)).resolves.toBe("flutter");

    const rn = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(
      path.join(rn, "package.json"),
      JSON.stringify({ dependencies: { expo: "*" } }),
    );
    await expect(detectFrameworkFromDisk(rn)).resolves.toBe("react-native");

    const web = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(
      path.join(web, "package.json"),
      JSON.stringify({ dependencies: { react: "*" } }),
    );
    await expect(detectFrameworkFromDisk(web)).resolves.toBe("website");

    const blank = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    await expect(detectFrameworkFromDisk(blank)).resolves.toBeUndefined();
  });

  it("detects multi-chain dApps for the web3 skill pack (item 32)", async () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3-"));
    fs.mkdirSync(path.join(tree, "src", "caide-web3"), { recursive: true });
    await expect(detectWeb3App(tree)).resolves.toBe(true);

    const deps = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3-"));
    fs.writeFileSync(
      path.join(deps, "package.json"),
      JSON.stringify({ dependencies: { wagmi: "*", react: "*" } }),
    );
    await expect(detectWeb3App(deps)).resolves.toBe(true);

    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3-"));
    fs.writeFileSync(
      path.join(plain, "package.json"),
      JSON.stringify({ dependencies: { react: "*" } }),
    );
    await expect(detectWeb3App(plain)).resolves.toBe(false);
    await expect(detectWeb3App(path.join(os.tmpdir(), "caide-nope-missing"))).resolves.toBe(false);
  });

  it("detects Flutter web3 apps via pubspec and lib code (F1)", async () => {
    const pub = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(
      path.join(pub, "pubspec.yaml"),
      "name: x\ndependencies:\n  web3dart: ^3.0.0\n",
    );
    await expect(detectWeb3App(pub)).resolves.toBe(true);

    const lib = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(
      path.join(lib, "pubspec.yaml"),
      "name: y\ndependencies:\n  flutter:\n    sdk: flutter\n",
    );
    fs.mkdirSync(path.join(lib, "lib", "wallet"), { recursive: true });
    fs.writeFileSync(
      path.join(lib, "lib", "wallet", "connect.dart"),
      "import 'package:walletconnect_dart/walletconnect_dart.dart';\nclass W {}",
    );
    await expect(detectWeb3App(lib)).resolves.toBe(true);

    const plainFlutter = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(
      path.join(plainFlutter, "pubspec.yaml"),
      "name: z\ndependencies:\n  go_router: ^1.0.0\n",
    );
    await expect(detectWeb3App(plainFlutter)).resolves.toBe(false);
  });

  it("assembles provider + unified tools with mode filtering", () => {
    const ctx = createTurnContext({
      sessionId: "s-turn",
      appPath: "/tmp/caide-test-app",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "accept-once",
    });
    try {
      expect(ctx.provider.providerId).toBe("openai");
      expect(ctx.provider.baseUrl).toBe("https://api.openai.com/v1");
      const names = ctx.tools.map((t) => t.name);
      expect(names).toContain("write_file");
      expect(names).toContain("search_replace");
      expect(names).toContain("open_preview");
      // Donor isEnabled: no DB link → DB tools hidden, add_integration shown.
      expect(names).not.toContain("execute_sql");
      expect(names).not.toContain("get_supabase_project_info");
      expect(names).not.toContain("get_neon_project_info");
      expect(names).toContain("add_integration");
      expect(names).not.toContain("write_plan");
      expect(allUnifiedToolDefs().length).toBeGreaterThanOrEqual(50);
      // Phase 5 sweep: FTS chat-history tools ride every agent turn.
      expect(names).toContain("search_chats");
      expect(names).toContain("read_chat");
      expect(names).toContain("share_artifact");
      expect(names).toContain("verify_design");

      const plan = createTurnContext({
        sessionId: "s-plan",
        appPath: "/tmp/caide-test-app",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        options: { planModeOnly: true },
        requestConsent: async () => "accept-once",
      });
      try {
        expect(plan.tools.map((t) => t.name)).toContain("write_plan");
        expect(plan.tools.map((t) => t.name)).not.toContain("write_file");
      } finally {
        plan.cleanup();
      }

      const ask = createTurnContext({
        sessionId: "s-ask",
        appPath: "/tmp/caide-test-app",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        options: { readOnly: true },
        requestConsent: async () => "accept-once",
      });
      try {
        const askNames = ask.tools.map((t) => t.name);
        expect(askNames).toContain("read_file");
        expect(askNames).toContain("list_dir");
        expect(askNames).toContain("search_files");
        expect(askNames).not.toContain("write_file");
        expect(askNames).not.toContain("search_replace");
        expect(askNames).not.toContain("delete_file");
        expect(askNames).not.toContain("run_command");
        expect(askNames).not.toContain("install_package");
        expect(askNames).not.toContain("execute_sandbox_script");
        // Ensure every single included tool in ask mode is read-only
        for (const tool of ask.tools) {
          expect(tool.readOnly).toBe(true);
        }
      } finally {
        ask.cleanup();
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("gates DB tools on the session link (donor isEnabled)", () => {
    // Managed link (project IDs present): DB tools shown, sibling-provider
    // info and add_integration hidden.
    linkDatabase("s-dblink", {
      provider: "supabase",
      databaseUrl: "postgres://link/db",
      projectId: "p1",
    });
    const ctx = createTurnContext({
      sessionId: "s-dblink",
      appPath: "/tmp/caide-test-app",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "accept-once",
    });
    try {
      const names = ctx.tools.map((t) => t.name);
      expect(names).toContain("execute_sql");
      expect(names).toContain("get_database_table_schema");
      expect(names).toContain("get_supabase_project_info");
      // Sibling-provider info stays hidden; integration is pointless linked.
      expect(names).not.toContain("get_neon_project_info");
      expect(names).not.toContain("add_integration");
    } finally {
      ctx.cleanup();
      unlinkDatabase("s-dblink");
    }
    // Bare-URL link (no IDs): raw SQL still runs, but the connection is not
    // managed — add_integration stays offered to allow upgrading (donor ID
    // semantics).
    linkDatabase("s-dbbare", { provider: "supabase", databaseUrl: "postgres://bare/db" });
    const bare = createTurnContext({
      sessionId: "s-dbbare",
      appPath: "/tmp/caide-test-app",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "accept-once",
    });
    try {
      const names = bare.tools.map((t) => t.name);
      expect(names).toContain("execute_sql");
      expect(names).toContain("add_integration");
    } finally {
      bare.cleanup();
      unlinkDatabase("s-dbbare");
    }
  });

  it("gates execution on consent and routes UI reveals", async () => {
    const ctx = createTurnContext({
      sessionId: "s-exec",
      appPath: fs.mkdtempSync(path.join(os.tmpdir(), "caide-exec-")),
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "decline",
    });
    try {
      await expect(ctx.executeWithConsent("run_command", { command: "ls" }, "t1")).rejects.toThrow(
        /declined/,
      );
      await expect(ctx.executeWithConsent("write_plan", {}, "t2")).rejects.toThrow(/not available/);
      expect(ctx.routeToolEvent("execute_sql")).toEqual({ revealDatabase: true });
      expect(ctx.routeToolEvent("write_file")).toEqual({ revealDatabase: false });
    } finally {
      ctx.cleanup();
    }
  });

  it("never times out a parked human wait (600s tool budget applies to real tools only)", async () => {
    const { setPlanTransport } = await import("../../dyad/plan/planTools.ts");
    const { pendingCount } = await import("../../dyad/plan/userPrompt.ts");
    const events: unknown[] = [];
    setPlanTransport({
      sendQuestionnaire: (sessionId, requestId, questions) =>
        events.push({ sessionId, requestId, questions }),
      sendEnvVarRequest: () => undefined,
      sendPlanUpdate: () => undefined,
      sendPlanExit: () => undefined,
    });
    const ctx = createTurnContext({
      sessionId: "s-wait",
      appPath: fs.mkdtempSync(path.join(os.tmpdir(), "caide-wait-")),
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "accept-once",
    });
    try {
      const pending = ctx.executeWithConsent(
        "planning_questionnaire",
        { questions: [{ question: "Q?", type: "text" }] },
        "t-wait",
      );
      // Let the tool park, then jump past the 600s tool budget: the waiter
      // must still be registered (an earlier build auto-dismissed parked
      // prompts at exactly 600s, zombifying the card).
      await new Promise((r) => setTimeout(r, 10));
      expect(pendingCount()).toBeGreaterThan(0);
      vi.useFakeTimers();
      try {
        await vi.advanceTimersByTimeAsync(601_000);
      } finally {
        vi.useRealTimers();
      }
      expect(pendingCount()).toBeGreaterThan(0);
      const { dismissUserInput } = await import("../../dyad/plan/userPrompt.ts");
      dismissUserInput((events[0] as any).requestId);
      await expect(pending).resolves.toMatch(/dismissed the questionnaire/);
    } finally {
      setPlanTransport(null);
      ctx.cleanup();
    }
  });

  it("propagates caller abort into parked human waits", async () => {
    const { setPlanTransport } = await import("../../dyad/plan/planTools.ts");
    setPlanTransport({
      sendQuestionnaire: () => undefined,
      sendEnvVarRequest: () => undefined,
      sendPlanUpdate: () => undefined,
      sendPlanExit: () => undefined,
    });
    const ctx = createTurnContext({
      sessionId: "s-abort",
      appPath: fs.mkdtempSync(path.join(os.tmpdir(), "caide-abort-")),
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      requestConsent: async () => "accept-once",
    });
    try {
      const controller = new AbortController();
      const pending = ctx.executeWithConsent(
        "planning_questionnaire",
        { questions: [{ question: "Q?", type: "text" }] },
        "t-abort",
        controller.signal,
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();
      await expect(pending).resolves.toMatch(/dismissed the questionnaire/);
    } finally {
      setPlanTransport(null);
      ctx.cleanup();
    }
  });

  it("full-access bypasses ask-default consent but preserves user bans", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-bypass-"));
    const ctx = createTurnContext({
      sessionId: "s-bypass",
      appPath: dir,
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      runtimeMode: "full-access",
      // Throwing transport: any consent park attempt fails the test.
      requestConsent: async () => {
        throw new Error("consent should never be requested in full access");
      },
    });
    try {
      // run_command defaults to ask — runs without a card in full access
      // (resolves instead of parking on the throwing requestConsent).
      const out = await ctx.executeWithConsent(
        "run_command",
        { command: "echo bypass-ok" },
        "t-bypass",
      );
      expect(out).toBeTruthy();
    } finally {
      ctx.cleanup();
    }
    // Explicit user bans still hold under full access: a "never" tool is
    // filtered from the turn (unavailable) rather than auto-allowed.
    const { MemoryConsentStore } = await import("../../dyad/tools/permissions.ts");
    const banned = new MemoryConsentStore();
    banned.set("run_command", "never");
    const ctx2 = createTurnContext({
      sessionId: "s-bypass-ban",
      appPath: dir,
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      runtimeMode: "full-access",
      store: banned,
      requestConsent: async () => "accept-once",
    });
    try {
      await expect(
        ctx2.executeWithConsent("run_command", { command: "echo hi" }, "t-ban"),
      ).rejects.toThrow(/not available/);
    } finally {
      ctx2.cleanup();
    }
  });
});
