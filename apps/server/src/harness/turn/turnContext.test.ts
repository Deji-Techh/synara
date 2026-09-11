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
  detectWeb3App,
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
    fs.writeFileSync(path.join(plain, "package.json"), JSON.stringify({ dependencies: { react: "*" } }));
    await expect(detectWeb3App(plain)).resolves.toBe(false);
    await expect(detectWeb3App(path.join(os.tmpdir(), "caide-nope-missing"))).resolves.toBe(false);
  });

  it("detects Flutter web3 apps via pubspec and lib code (F1)", async () => {
    const pub = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(path.join(pub, "pubspec.yaml"), "name: x\ndependencies:\n  web3dart: ^3.0.0\n");
    await expect(detectWeb3App(pub)).resolves.toBe(true);

    const lib = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(path.join(lib, "pubspec.yaml"), "name: y\ndependencies:\n  flutter:\n    sdk: flutter\n");
    fs.mkdirSync(path.join(lib, "lib", "wallet"), { recursive: true });
    fs.writeFileSync(
      path.join(lib, "lib", "wallet", "connect.dart"),
      "import 'package:walletconnect_dart/walletconnect_dart.dart';\nclass W {}",
    );
    await expect(detectWeb3App(lib)).resolves.toBe(true);

    const plainFlutter = fs.mkdtempSync(path.join(os.tmpdir(), "caide-w3f-"));
    fs.writeFileSync(path.join(plainFlutter, "pubspec.yaml"), "name: z\ndependencies:\n  go_router: ^1.0.0\n");
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
      expect(names).toContain("execute_sql");
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
