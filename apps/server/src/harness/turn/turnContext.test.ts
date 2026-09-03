// FILE: turnContext.test.ts
// Purpose: M3 gate — turn assembly: provider auto/explicit, framework
// detection, unified tool filtering, consent-gated execution, UI routing.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  allUnifiedToolDefs,
  createTurnContext,
  detectFrameworkFromDisk,
} from "./turnContext.ts";

describe("turn context wire (m3)", () => {
  it("detects frameworks from workspace files", async () => {
    const flutter = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(path.join(flutter, "pubspec.yaml"), "name: x\n");
    await expect(detectFrameworkFromDisk(flutter)).resolves.toBe("flutter");

    const rn = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(path.join(rn, "package.json"), JSON.stringify({ dependencies: { expo: "*" } }));
    await expect(detectFrameworkFromDisk(rn)).resolves.toBe("react-native");

    const web = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    fs.writeFileSync(path.join(web, "package.json"), JSON.stringify({ dependencies: { react: "*" } }));
    await expect(detectFrameworkFromDisk(web)).resolves.toBe("website");

    const blank = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fw-"));
    await expect(detectFrameworkFromDisk(blank)).resolves.toBeUndefined();
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
      expect(names).toContain("execute_sql");
      expect(names).not.toContain("write_plan");
      expect(allUnifiedToolDefs().length).toBeGreaterThanOrEqual(50);

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
    } finally {
      ctx.cleanup();
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
      await expect(ctx.executeWithConsent("write_plan", {}, "t2")).rejects.toThrow(
        /not available/,
      );
      expect(ctx.routeToolEvent("execute_sql")).toEqual({ revealDatabase: true });
      expect(ctx.routeToolEvent("write_file")).toEqual({ revealDatabase: false });
    } finally {
      ctx.cleanup();
    }
  });
});
