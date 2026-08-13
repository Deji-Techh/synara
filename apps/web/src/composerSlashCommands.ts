import type { GitBranch, ProviderKind } from "@caide/contracts";
import {
  BUILT_IN_COMPOSER_SLASH_COMMANDS,
  isBuiltInComposerSlashCommandName,
  normalizeComposerSlashCommandName,
  type BuiltInComposerSlashCommand,
} from "@caide/shared/composerSlashCommands";
import { rankProviderDiscoveryItems } from "./lib/providerDiscovery";

export { BUILT_IN_COMPOSER_SLASH_COMMANDS };

export type ComposerSlashCommand = BuiltInComposerSlashCommand;

export interface ComposerSlashCommandDefinition {
  command: ComposerSlashCommand;
  label: `/${ComposerSlashCommand}`;
  description: string;
  source: "app" | "shared";
}

export interface ComposerSlashInvocation {
  command: ComposerSlashCommand;
  args: string;
}

export type FastSlashCommandAction = "toggle" | "on" | "off" | "status" | "invalid";
export type ForkSlashCommandTarget = "local" | "worktree";

const CLAUDE_NATIVE_COMMAND_ALIASES: Record<string, readonly string[]> = {
  clear: ["reset", "new"],
  config: ["settings"],
  desktop: ["app"],
  exit: ["quit"],
  feedback: ["bug"],
  branch: ["fork"],
  mobile: ["ios", "android"],
  permissions: ["allowed-tools"],
  "remote-control": ["rc"],
  resume: ["continue"],
};

function getProviderNativeSlashCommandAliases(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeComposerSlashCommandName(command);
  if (provider !== "claudeAgent") {
    return [];
  }
  return CLAUDE_NATIVE_COMMAND_ALIASES[normalizedCommand] ?? [];
}

function expandProviderNativeSlashCommandNames(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
): string[] {
  const expandedNames = new Set<string>();
  for (const commandName of commandNames) {
    const normalizedCommandName = normalizeComposerSlashCommandName(commandName);
    if (!normalizedCommandName) {
      continue;
    }
    expandedNames.add(normalizedCommandName);
    for (const alias of getProviderNativeSlashCommandAliases(provider, normalizedCommandName)) {
      expandedNames.add(alias);
    }
  }
  return [...expandedNames];
}

/**
 * Providers where app-owned /review (target picker + structured prompt) must
 * win over listing a native "review" command. OpenCode exposes /review in its
 * command list but does not honor bare `/review` text turns (#218).
 */
export function providerUsesAppOwnedReviewSlashCommand(provider: ProviderKind): boolean {
  return provider === "codex" || provider === "opencode";
}

function shouldKeepBuiltInSlashCommandDespiteNativeCollision(
  provider: ProviderKind,
  command: ComposerSlashCommand,
): boolean {
  return (
    command === "automation" ||
    command === "export" ||
    command === "feedback" ||
    (providerUsesAppOwnedReviewSlashCommand(provider) && command === "review")
  );
}

export function shouldHideProviderNativeCommandFromComposerMenu(
  provider: ProviderKind,
  command: string,
  options: { readonly availableAppCommands?: ReadonlySet<string> } = {},
): boolean {
  const normalizedCommand = normalizeComposerSlashCommandName(command);
  const appCommandIsAvailable = options.availableAppCommands?.has(normalizedCommand) ?? true;
  return (
    normalizedCommand === "automation" ||
    (normalizedCommand === "export" && appCommandIsAvailable) ||
    (normalizedCommand === "feedback" && appCommandIsAvailable) ||
    (providerUsesAppOwnedReviewSlashCommand(provider) && normalizedCommand === "review")
  );
}

/**
 * True when a discovered native "review" command should be sent as plain
 * `/review` text. Codex/OpenCode use the app review UX instead (#218).
 */
export function providerSupportsTextNativeReviewCommand(
  provider: ProviderKind,
  nativeCommandNames: ReadonlyArray<{ readonly name: string } | string>,
): boolean {
  if (providerUsesAppOwnedReviewSlashCommand(provider)) {
    return false;
  }
  return nativeCommandNames.some((command) => {
    const name = typeof command === "string" ? command : command.name;
    return name.trim().toLowerCase() === "review";
  });
}

export function getProviderNativeSlashCommandSearchTerms(
  provider: ProviderKind,
  command: string,
): readonly string[] {
  const normalizedCommand = normalizeComposerSlashCommandName(command);
  return [normalizedCommand, ...getProviderNativeSlashCommandAliases(provider, normalizedCommand)];
}

const COMPOSER_SLASH_COMMAND_DEFINITIONS: Record<
  ComposerSlashCommand,
  ComposerSlashCommandDefinition
> = {
  init: {
    command: "init",
    label: "/init",
    description: "Initialize or update AGENTS.md instructions for this codebase",
    source: "app",
  },
  spawn: {
    command: "spawn",
    label: "/spawn",
    description: "Spawn parallel subagents to concurrently execute the current task",
    source: "app",
  },
  btw: {
    command: "btw",
    label: "/btw",
    description: "Ask a quick question without interrupting the main conversation",
    source: "app",
  },
  goal: {
    command: "goal",
    label: "/goal",
    description: "Run until the specified goal is completely finished",
    source: "app",
  },
  schedule: {
    command: "schedule",
    label: "/schedule",
    description: "Run an instruction on a recurring schedule or as a one-time timer",
    source: "app",
  },
  browser: {
    command: "browser",
    label: "/browser",
    description: "Invoke a browser agent for web tasks",
    source: "app",
  },
  "grill-me": {
    command: "grill-me",
    label: "/grill-me",
    description: "Interview me to align on a plan",
    source: "app",
  },
  "teamwork-preview": {
    command: "teamwork-preview",
    label: "/teamwork-preview",
    description: "Invoke a team of agents to autonomously tackle large projects",
    source: "app",
  },
  learn: {
    command: "learn",
    label: "/learn",
    description: "Reflect on recent successes or corrections to capture reusable skills or rules",
    source: "app",
  },
  doctor: {
    command: "doctor",
    label: "/doctor",
    description: "Check Flutter SDK, Dart, Node.js, and Git toolchain health",
    source: "app",
  },
  test: {
    command: "test",
    label: "/test",
    description: "Run Flutter test suite with live diagnostics",
    source: "app",
  },
  analyze: {
    command: "analyze",
    label: "/analyze",
    description: "Run flutter analyze to check for errors and missing imports",
    source: "app",
  },
  build: {
    command: "build",
    label: "/build",
    description: "Trigger a production Flutter release build (APK / Bundle / Web)",
    source: "app",
  },
  preview: {
    command: "preview",
    label: "/preview",
    description: "Toggle the Flutter live device preview dock",
    source: "app",
  },
  theme: {
    command: "theme",
    label: "/theme",
    description: "Open the Caide theme palette switcher",
    source: "app",
  },
  clear: {
    command: "clear",
    label: "/clear",
    description: "Start a fresh thread and clear the current conversation context",
    source: "shared",
  },
  compact: {
    command: "compact",
    label: "/compact",
    description: "Compact the current thread context to free space",
    source: "app",
  },
  model: {
    command: "model",
    label: "/model",
    description: "Switch response model for this thread",
    source: "shared",
  },
  plan: {
    command: "plan",
    label: "/plan",
    description: "Switch this thread into plan mode",
    source: "app",
  },
  default: {
    command: "default",
    label: "/default",
    description: "Switch this thread back to normal chat mode",
    source: "app",
  },
  review: {
    command: "review",
    label: "/review",
    description: "Start a code review for current changes",
    source: "app",
  },
  fork: {
    command: "fork",
    label: "/fork",
    description: "Fork this thread into local or a new worktree",
    source: "app",
  },
  side: {
    command: "side",
    label: "/side",
    description: "Open a guarded Side from this thread",
    source: "app",
  },
  status: {
    command: "status",
    label: "/status",
    description: "Show context usage and rate-limit status",
    source: "app",
  },
  subagents: {
    command: "subagents",
    label: "/subagents",
    description: "Insert a prompt that asks the assistant to delegate work",
    source: "app",
  },
  fast: {
    command: "fast",
    label: "/fast",
    description: "Turn fast mode on or off for this thread",
    source: "app",
  },
  export: {
    command: "export",
    label: "/export",
    description: "Download this thread as a ZIP archive (thread.json + transcript.md)",
    source: "app",
  },
  feedback: {
    command: "feedback",
    label: "/feedback",
    description: "Send feedback to the Caide team",
    source: "app",
  },
  automation: {
    command: "automation",
    label: "/automation",
    description: "Create a scheduled automation from this prompt",
    source: "app",
  },
};

export function isBuiltInComposerSlashCommand(value: string): value is ComposerSlashCommand {
  return isBuiltInComposerSlashCommandName(value);
}

export function parseComposerSlashInvocation(text: string): ComposerSlashInvocation | null {
  return parseComposerSlashInvocationForCommands(text, BUILT_IN_COMPOSER_SLASH_COMMANDS);
}

export function parseComposerSlashInvocationForCommands(
  text: string,
  commands: ReadonlyArray<ComposerSlashCommand>,
): ComposerSlashInvocation | null {
  const match = /^\/([a-z-]+)(?:\s+(.*))?$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = normalizeComposerSlashCommandName(match[1] ?? "");
  if (!command || !commands.includes(command as ComposerSlashCommand)) {
    return null;
  }
  return {
    command: command as ComposerSlashCommand,
    args: (match[2] ?? "").trim(),
  };
}

export function filterComposerSlashCommands(
  query: string,
  commands: ReadonlyArray<ComposerSlashCommand> = BUILT_IN_COMPOSER_SLASH_COMMANDS,
): ComposerSlashCommandDefinition[] {
  const matches = rankProviderDiscoveryItems(commands, query, (command) => {
    const definition = COMPOSER_SLASH_COMMAND_DEFINITIONS[command];
    return [
      { value: command },
      { value: definition.label.slice(1) },
      { value: definition.description, weight: 200 },
    ];
  });

  return matches.map((command) => COMPOSER_SLASH_COMMAND_DEFINITIONS[command]);
}

function hasMeaningfulComposerText(prompt: string): boolean {
  return prompt.trim().length > 0;
}

export function canOfferForkSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default"
  );
}

export function canOfferSideSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
  interactionMode: "default" | "plan";
  isSidechat: boolean;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0 &&
    input.interactionMode === "default" &&
    !input.isSidechat
  );
}

export function canOfferReviewSlashCommand(input: {
  prompt: string;
  imageCount: number;
  terminalContextCount: number;
  selectedSkillCount: number;
  selectedMentionCount: number;
}): boolean {
  return (
    !hasMeaningfulComposerText(input.prompt) &&
    input.imageCount === 0 &&
    input.terminalContextCount === 0 &&
    input.selectedSkillCount === 0 &&
    input.selectedMentionCount === 0
  );
}

export function buildSubagentsPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Run subagents for different tasks. Delegate distinct work in parallel when helpful and then synthesize the results.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

export function buildInitPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Initialize an AGENTS.md file in the project root with instructions the agent will follow: coding standards, Flutter architecture guidelines, state management patterns, quality check instructions, and tool conventions.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

export function buildSpawnPrompt(existingPrompt: string): string {
  const cannedPrompt =
    "Spawn subagents in parallel to handle the current tasks concurrently. Delegate distinct subtasks across subagents and synthesize all findings and code changes.";
  const trimmedPrompt = existingPrompt.trim();
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${cannedPrompt}` : cannedPrompt;
}

export function buildReviewPrompt(input: { target: "changes" | "base-branch" }): string {
  const baseInstruction =
    "Review the local code changes for bugs, risks, behavioural regressions, and missing tests. Findings first, ordered by severity.";
  if (input.target === "base-branch") {
    return `${baseInstruction}\nFocus on the current branch diff against its base branch.`;
  }
  return `${baseInstruction}\nFocus on the current uncommitted changes.`;
}

export function parseFastSlashCommandAction(text: string): FastSlashCommandAction | null {
  const invocation = parseComposerSlashInvocation(text);
  if (!invocation || invocation.command !== "fast") {
    return null;
  }
  const arg = invocation.args.toLowerCase();
  if (!arg) {
    return "toggle";
  }
  if (arg === "on") {
    return "on";
  }
  if (arg === "off") {
    return "off";
  }
  if (arg === "status") {
    return "status";
  }
  return "invalid";
}

export function resolveComposerSlashRootBranch(input: {
  branches: ReadonlyArray<GitBranch> | null | undefined;
  activeProjectCwd: string | null | undefined;
  activeThreadBranch: string | null | undefined;
}): string | null {
  return (
    input.branches?.find(
      (branch) =>
        branch.current === true &&
        (branch.worktreePath === null ||
          branch.worktreePath === undefined ||
          branch.worktreePath === input.activeProjectCwd),
    )?.name ??
    input.branches?.find((branch) => branch.current === true)?.name ??
    input.activeThreadBranch ??
    null
  );
}

export function getAvailableComposerSlashCommands(input: {
  provider: ProviderKind;
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferReviewCommand: boolean;
  canOfferForkCommand: boolean;
  canOfferSideCommand: boolean;
  canOfferExportCommand: boolean;
  providerNativeCommandNames?: ReadonlyArray<string>;
}): ComposerSlashCommand[] {
  const collidingNativeCommandNames = new Set<ComposerSlashCommand>(
    expandProviderNativeSlashCommandNames(
      input.provider,
      input.providerNativeCommandNames ?? [],
    ).filter(
      (name): name is ComposerSlashCommand =>
        isBuiltInComposerSlashCommand(name) &&
        !shouldKeepBuiltInSlashCommandDespiteNativeCollision(input.provider, name),
    ),
  );

  const availableCommands: ComposerSlashCommand[] =
    input.provider !== "claudeAgent"
      ? [
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
          ...(input.canOfferCompactCommand ? (["compact"] as const) : []),
          "model",
          ...(input.supportsFastSlashCommand ? (["fast"] as const) : []),
          "plan",
          "default",
          ...(input.canOfferReviewCommand ? (["review"] as const) : []),
          ...(input.canOfferForkCommand ? (["fork"] as const) : []),
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
          "status",
          "subagents",
          ...(input.canOfferExportCommand ? (["export"] as const) : []),
          "feedback",
          "automation",
        ]
      : [
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
          ...(input.canOfferSideCommand ? (["side"] as const) : []),
          ...(input.canOfferExportCommand ? (["export"] as const) : []),
          "feedback",
          "automation",
        ];
  return availableCommands.filter((command) => !collidingNativeCommandNames.has(command));
}

export function hasProviderNativeSlashCommand(
  provider: ProviderKind,
  commandNames: ReadonlyArray<string>,
  command: string,
): boolean {
  const normalizedCommand = normalizeComposerSlashCommandName(command);
  return expandProviderNativeSlashCommandNames(provider, commandNames).includes(normalizedCommand);
}

export function buildSlashReviewComposerPrompt(args: string): string {
  const trimmedArgs = args.trim();
  const normalizedArgs = trimmedArgs.toLowerCase();
  const reviewTarget =
    normalizedArgs === "base" || normalizedArgs.startsWith("base ") ? "base-branch" : "changes";
  const basePrompt = buildReviewPrompt({ target: reviewTarget });
  if (!trimmedArgs) {
    return basePrompt;
  }
  if (reviewTarget === "base-branch") {
    const baseBranchHint = trimmedArgs.replace(/^base\b/i, "").trim();
    return baseBranchHint.length > 0
      ? `${basePrompt}\nUse ${baseBranchHint} as the base branch if needed.`
      : basePrompt;
  }
  return `${basePrompt}\nFocus especially on: ${trimmedArgs}`;
}

// `/fork` optionally accepts only an explicit target shorthand like `/fork local`.
export function parseForkSlashCommandArgs(args: string): {
  target: ForkSlashCommandTarget | null;
  invalid: boolean;
} {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) {
    return { target: null, invalid: false };
  }

  const match = /^(local|worktree)$/i.exec(trimmedArgs);
  if (!match) {
    return { target: null, invalid: true };
  }

  return {
    target: match[1]!.toLowerCase() as ForkSlashCommandTarget,
    invalid: false,
  };
}
