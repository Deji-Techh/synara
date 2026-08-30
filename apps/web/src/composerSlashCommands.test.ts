import { describe, expect, it } from "vitest";

import {
  buildInitPrompt,
  buildReviewPrompt,
  buildSlashReviewComposerPrompt,
  buildSpawnPrompt,
  buildSubagentsPrompt,
  canOfferForkSlashCommand,
  canOfferReviewSlashCommand,
  canOfferSideSlashCommand,
  filterComposerSlashCommands,
  getAvailableComposerSlashCommands,
  hasProviderNativeSlashCommand,
  isBuiltInComposerSlashCommand,
  parseComposerSlashInvocation,
  parseComposerSlashInvocationForCommands,
  parseFastSlashCommandAction,
  parseForkSlashCommandArgs,
  parseGoalSlashArgs,
  buildGoalCreateTitle,
  providerSupportsTextNativeReviewCommand,
  shouldHideProviderNativeCommandFromComposerMenu,
} from "./composerSlashCommands";

describe("composerSlashCommands", () => {
  it("recognizes built-in slash commands", () => {
    expect(isBuiltInComposerSlashCommand("init")).toBe(true);
    expect(isBuiltInComposerSlashCommand("spawn")).toBe(true);
    expect(isBuiltInComposerSlashCommand("review")).toBe(true);
    expect(isBuiltInComposerSlashCommand("fast")).toBe(true);
    expect(isBuiltInComposerSlashCommand("automation")).toBe(true);
    expect(isBuiltInComposerSlashCommand("export")).toBe(true);
    expect(isBuiltInComposerSlashCommand("feedback")).toBe(true);
    expect(isBuiltInComposerSlashCommand("unknown")).toBe(false);
  });

  it("filters slash commands by query", () => {
    expect(filterComposerSlashCommands("rev").map((entry) => entry.command)).toEqual([
      "review",
      "preview",
      "teamwork-preview",
    ]);
    expect(filterComposerSlashCommands("fast").map((entry) => entry.command)).toEqual(["fast"]);
    expect(filterComposerSlashCommands("auto").map((entry) => entry.command)).toEqual([
      "automation",
      "teamwork-preview",
      "goal",
    ]);
    expect(filterComposerSlashCommands("feed").map((entry) => entry.command)).toEqual(["feedback"]);
    expect(filterComposerSlashCommands("init").map((entry) => entry.command)).toEqual(["init"]);
    expect(filterComposerSlashCommands("spawn").map((entry) => entry.command)).toEqual(["spawn"]);
  });

  it("ranks slash command name matches before description-only matches", () => {
    expect(
      filterComposerSlashCommands("mode", ["fast", "default", "model"]).map(
        (entry) => entry.command,
      ),
    ).toEqual(["model", "fast", "default"]);
  });

  it("parses slash invocations with optional arguments", () => {
    expect(parseComposerSlashInvocation("/review current diff")).toEqual({
      command: "review",
      args: "current diff",
    });
    expect(parseComposerSlashInvocation("/fast")).toEqual({
      command: "fast",
      args: "",
    });
    expect(parseComposerSlashInvocation("/side is this safe?")).toEqual({
      command: "side",
      args: "is this safe?",
    });
    expect(parseComposerSlashInvocation("/automation every 6h check the page")).toEqual({
      command: "automation",
      args: "every 6h check the page",
    });
    expect(parseComposerSlashInvocation("/feedback")).toEqual({
      command: "feedback",
      args: "",
    });
    expect(parseComposerSlashInvocation("review")).toBeNull();
  });

  it("does not parse app slash commands that are shadowed by provider-native commands", () => {
    expect(parseComposerSlashInvocationForCommands("/fast", ["clear", "model"])).toBeNull();
    expect(parseComposerSlashInvocationForCommands("/clear", ["clear", "model"])).toEqual({
      command: "clear",
      args: "",
    });
  });

  it("parses /fast actions", () => {
    expect(parseFastSlashCommandAction("/fast")).toBe("toggle");
    expect(parseFastSlashCommandAction("/fast on")).toBe("on");
    expect(parseFastSlashCommandAction("/fast off")).toBe("off");
    expect(parseFastSlashCommandAction("/fast status")).toBe("status");
    expect(parseFastSlashCommandAction("/fast maybe")).toBe("invalid");
    expect(parseFastSlashCommandAction("/review")).toBeNull();
  });

  it("parses /fork target shorthand only", () => {
    expect(parseForkSlashCommandArgs("")).toEqual({
      target: null,
      invalid: false,
    });
    expect(parseForkSlashCommandArgs("local")).toEqual({
      target: "local",
      invalid: false,
    });
    expect(parseForkSlashCommandArgs("  worktree  ")).toEqual({
      target: "worktree",
      invalid: false,
    });
    expect(parseForkSlashCommandArgs("branch")).toEqual({
      target: null,
      invalid: true,
    });
  });

  it("parses /goal args into create vs dyad subcommands", () => {
    expect(parseGoalSlashArgs("")).toEqual({ kind: "create", objective: "" });
    expect(parseGoalSlashArgs("implement feature X")).toEqual({
      kind: "create",
      objective: "implement feature X",
    });
    expect(parseGoalSlashArgs("status page")).toEqual({
      kind: "subcommand",
      subcommand: "status",
      argument: "page",
    });
    expect(parseGoalSlashArgs("status")).toEqual({
      kind: "subcommand",
      subcommand: "status",
      argument: "",
    });
    expect(parseGoalSlashArgs("pause")).toEqual({
      kind: "subcommand",
      subcommand: "pause",
      argument: "",
    });
    expect(parseGoalSlashArgs("pause ran out of budget")).toEqual({
      kind: "subcommand",
      subcommand: "pause",
      argument: "ran out of budget",
    });
    expect(parseGoalSlashArgs("steer focus on the login flow")).toEqual({
      kind: "subcommand",
      subcommand: "steer",
      argument: "focus on the login flow",
    });
    expect(parseGoalSlashArgs("history")).toEqual({
      kind: "subcommand",
      subcommand: "history",
      argument: "",
    });
  });

  it("derives a goal title from the objective first line, mirroring the engine", () => {
    expect(buildGoalCreateTitle("implement feature X")).toBe("implement feature X");
    expect(buildGoalCreateTitle("")).toBe("New goal");
    expect(buildGoalCreateTitle("first line\nsecond line")).toBe("first line");
  });

  it("only offers /fork for an otherwise empty default composer", () => {
    expect(
      canOfferForkSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "default",
      }),
    ).toBe(true);

    expect(
      canOfferForkSlashCommand({
        prompt: "not empty",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "default",
      }),
    ).toBe(false);

    expect(
      canOfferForkSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "plan",
      }),
    ).toBe(false);

    expect(
      canOfferForkSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "debug",
      }),
    ).toBe(false);
  });

  it("only offers /side for a main-thread empty default composer", () => {
    expect(
      canOfferSideSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "default",
        isSidechat: false,
      }),
    ).toBe(true);

    expect(
      canOfferSideSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "default",
        isSidechat: true,
      }),
    ).toBe(false);

    expect(
      canOfferSideSlashCommand({
        prompt: "not empty",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "default",
        isSidechat: false,
      }),
    ).toBe(false);

    expect(
      canOfferSideSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
        interactionMode: "debug",
        isSidechat: false,
      }),
    ).toBe(false);
  });

  it("only offers /review for an otherwise empty composer", () => {
    expect(
      canOfferReviewSlashCommand({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
      }),
    ).toBe(true);

    expect(
      canOfferReviewSlashCommand({
        prompt: "explain this",
        imageCount: 0,
        terminalContextCount: 0,
        selectedSkillCount: 0,
        selectedMentionCount: 0,
      }),
    ).toBe(false);
  });

  it("builds slash-command canned prompts", () => {
    expect(buildSubagentsPrompt("")).toContain("Run subagents for different tasks");
    expect(buildSubagentsPrompt("Initial context")).toBe(
      "Initial context\n\nRun subagents for different tasks. Delegate distinct work in parallel when helpful and then synthesize the results.",
    );
    expect(buildInitPrompt("")).toContain("Initialize an AGENTS.md file in the project root");
    expect(buildInitPrompt("Prefix")).toContain("Prefix\n\nInitialize an AGENTS.md file");
    expect(buildSpawnPrompt("")).toContain("Spawn subagents in parallel");
    expect(buildSpawnPrompt("Prefix")).toContain("Prefix\n\nSpawn subagents in parallel");
    expect(buildReviewPrompt({ target: "changes" })).toContain(
      "Focus on the current uncommitted changes.",
    );
    expect(buildReviewPrompt({ target: "base-branch" })).toContain(
      "Focus on the current branch diff against its base branch.",
    );
    expect(buildSlashReviewComposerPrompt("")).toContain(
      "Focus on the current uncommitted changes.",
    );
    expect(buildSlashReviewComposerPrompt("base main")).toContain(
      "Use main as the base branch if needed.",
    );
    expect(buildSlashReviewComposerPrompt("performance")).toContain(
      "Focus especially on: performance",
    );
  });

  it("filters app slash commands when a provider exposes the same command natively", () => {
    const availableCommands = getAvailableComposerSlashCommands({
      provider: "anthropic",
      supportsFastSlashCommand: true,
      canOfferCompactCommand: true,
      canOfferReviewCommand: true,
      canOfferForkCommand: true,
      canOfferSideCommand: true,
      canOfferExportCommand: true,
      providerNativeCommandNames: ["model", "plan"],
    });

    expect(availableCommands).not.toContain("model");
    expect(availableCommands).not.toContain("plan");
  });

  it("keeps app-level /review available for codex even when native review exists", () => {
    const availableCommands = getAvailableComposerSlashCommands({
      provider: "openai",
      supportsFastSlashCommand: true,
      canOfferCompactCommand: true,
      canOfferReviewCommand: true,
      canOfferForkCommand: true,
      canOfferSideCommand: true,
      canOfferExportCommand: true,
      providerNativeCommandNames: ["review"],
    });

    expect(availableCommands).toContain("review");
    expect(shouldHideProviderNativeCommandFromComposerMenu("openai", "review")).toBe(true);
  });

  it("keeps app-level /review for opencode and does not treat review as text-native", () => {
    expect(providerSupportsTextNativeReviewCommand("openai", ["review"])).toBe(false);
    expect(providerSupportsTextNativeReviewCommand("anthropic", ["review"])).toBe(true);
  });

  it("keeps app-level /automation available even if a provider exposes a native collision", () => {
    const availableCommands = getAvailableComposerSlashCommands({
      provider: "anthropic",
      supportsFastSlashCommand: true,
      canOfferCompactCommand: true,
      canOfferReviewCommand: true,
      canOfferForkCommand: true,
      canOfferSideCommand: true,
      canOfferExportCommand: true,
      providerNativeCommandNames: ["automation"],
    });

    expect(availableCommands).toContain("automation");
    expect(shouldHideProviderNativeCommandFromComposerMenu("anthropic", "automation")).toBe(true);
  });

  it("keeps Feedback Caide ahead of provider-native /feedback", () => {
    const availableCommands = getAvailableComposerSlashCommands({
      provider: "anthropic",
      supportsFastSlashCommand: true,
      canOfferCompactCommand: true,
      canOfferReviewCommand: true,
      canOfferForkCommand: true,
      canOfferSideCommand: true,
      canOfferExportCommand: true,
      providerNativeCommandNames: ["feedback"],
    });

    expect(availableCommands).toContain("feedback");
    expect(shouldHideProviderNativeCommandFromComposerMenu("anthropic", "feedback")).toBe(true);
  });

  it("only exposes Caide-owned app commands for claude", () => {
    expect(
      getAvailableComposerSlashCommands({
        provider: "anthropic",
        supportsFastSlashCommand: true,
        canOfferCompactCommand: true,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: true,
      }),
    ).toEqual([
      "init",
      "spawn",
      "btw",
      "goal",
      "schedule",
      "browser",
      "grill-me",
      "teamwork-preview",
      "learn",
      "doctor",
      "test",
      "analyze",
      "build",
      "preview",
      "theme",
      "debug",
      "side",
      "export",
      "feedback",
      "automation",
      "goals",
      "commands",
      "help",
    ]);
  });

  it("offers the app-level /export command on every provider", () => {
    expect(
      getAvailableComposerSlashCommands({
        provider: "openai",
        supportsFastSlashCommand: true,
        canOfferCompactCommand: true,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: true,
      }),
    ).toContain("export");
  });

  it("omits the app-level /export command when no server thread exists", () => {
    expect(
      getAvailableComposerSlashCommands({
        provider: "openai",
        supportsFastSlashCommand: true,
        canOfferCompactCommand: true,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: false,
      }),
    ).not.toContain("export");
  });

  it("keeps app-level /export available even if a provider exposes a native collision", () => {
    const availableCommands = getAvailableComposerSlashCommands({
      provider: "anthropic",
      supportsFastSlashCommand: true,
      canOfferCompactCommand: true,
      canOfferReviewCommand: true,
      canOfferForkCommand: true,
      canOfferSideCommand: true,
      canOfferExportCommand: true,
      providerNativeCommandNames: ["export"],
    });

    expect(availableCommands).toContain("export");
    expect(shouldHideProviderNativeCommandFromComposerMenu("anthropic", "export")).toBe(true);
  });

  it("keeps native /export visible on surfaces without app-level /export", () => {
    const kanbanAppCommands = new Set(["clear", "default", "plan"]);
    const mainComposerAppCommands = new Set(["clear", "export", "model"]);

    expect(
      shouldHideProviderNativeCommandFromComposerMenu("anthropic", "export", {
        availableAppCommands: kanbanAppCommands,
      }),
    ).toBe(false);
    expect(
      shouldHideProviderNativeCommandFromComposerMenu("anthropic", "export", {
        availableAppCommands: mainComposerAppCommands,
      }),
    ).toBe(true);
  });

  it("only offers /compact when Codex compaction is available", () => {
    expect(
      getAvailableComposerSlashCommands({
        provider: "openai",
        supportsFastSlashCommand: true,
        canOfferCompactCommand: true,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: true,
      }),
    ).toContain("compact");

    expect(
      getAvailableComposerSlashCommands({
        provider: "openai",
        supportsFastSlashCommand: true,
        canOfferCompactCommand: false,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: true,
      }),
    ).not.toContain("compact");
  });

  it("exposes shared app slash commands for Antigravity", () => {
    expect(
      getAvailableComposerSlashCommands({
        provider: "google",
        supportsFastSlashCommand: false,
        canOfferCompactCommand: false,
        canOfferReviewCommand: true,
        canOfferForkCommand: true,
        canOfferSideCommand: true,
        canOfferExportCommand: true,
      }),
    ).toEqual([
      "init",
      "spawn",
      "btw",
      "goal",
      "schedule",
      "browser",
      "grill-me",
      "teamwork-preview",
      "learn",
      "doctor",
      "test",
      "analyze",
      "build",
      "preview",
      "theme",
      "clear",
      "model",
      "plan",
      "debug",
      "default",
      "review",
      "fork",
      "side",
      "status",
      "subagents",
      "export",
      "feedback",
      "automation",
      "goals",
      "commands",
      "help",
    ]);
  });

  it("treats claude aliases like /fork as provider-native collisions", () => {
    expect(hasProviderNativeSlashCommand("anthropic", ["branch", "model"], "fork")).toBe(true);
    expect(hasProviderNativeSlashCommand("anthropic", ["clear"], "reset")).toBe(true);
  });
});
