import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import type { ProviderKind } from "./orchestration";

export const CODEX_REASONING_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;
// Codex app-server can add model-specific efforts through runtime discovery.
export type CodexReasoningEffort = string;
export const CLAUDE_API_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeApiEffort = (typeof CLAUDE_API_EFFORT_OPTIONS)[number];
export const CLAUDE_PROMPT_MODE_OPTIONS = ["ultrathink"] as const;
export type ClaudePromptMode = (typeof CLAUDE_PROMPT_MODE_OPTIONS)[number];
export const CLAUDE_CODE_MODE_OPTIONS = ["ultracode"] as const;
export type ClaudeCodeMode = (typeof CLAUDE_CODE_MODE_OPTIONS)[number];
export const CLAUDE_CODE_EFFORT_OPTIONS = [
  ...CLAUDE_API_EFFORT_OPTIONS,
  ...CLAUDE_PROMPT_MODE_OPTIONS,
  ...CLAUDE_CODE_MODE_OPTIONS,
] as const;
export type ClaudeCodeEffort = (typeof CLAUDE_CODE_EFFORT_OPTIONS)[number];
export const PI_THINKING_LEVEL_OPTIONS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type PiThinkingLevel = (typeof PI_THINKING_LEVEL_OPTIONS)[number];
export const GROK_REASONING_EFFORT_OPTIONS = ["none", "low", "medium", "high"] as const;
export type GrokReasoningEffort = (typeof GROK_REASONING_EFFORT_OPTIONS)[number];
export const DROID_REASONING_EFFORT_OPTIONS = [
  "off",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
// Droid exposes effort values dynamically over ACP; keep the static list only
// as an offline fallback so newly added values survive transport and drafts.
export type DroidReasoningEffort = string;
export type ProviderReasoningEffort =
  | CodexReasoningEffort
  | ClaudeCodeEffort
  | PiThinkingLevel
  | GrokReasoningEffort
  | DroidReasoningEffort;

export const ProviderOptionChoice = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  isDefault: Schema.optional(Schema.Literal(true)),
});
export type ProviderOptionChoice = typeof ProviderOptionChoice.Type;

const ProviderOptionDescriptorBase = {
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
} as const;

export const SelectProviderOptionDescriptor = Schema.Struct({
  ...ProviderOptionDescriptorBase,
  type: Schema.Literal("select"),
  options: Schema.Array(ProviderOptionChoice),
  currentValue: Schema.optional(TrimmedNonEmptyString),
  promptInjectedValues: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type SelectProviderOptionDescriptor = typeof SelectProviderOptionDescriptor.Type;

export const BooleanProviderOptionDescriptor = Schema.Struct({
  ...ProviderOptionDescriptorBase,
  type: Schema.Literal("boolean"),
  currentValue: Schema.optional(Schema.Boolean),
});
export type BooleanProviderOptionDescriptor = typeof BooleanProviderOptionDescriptor.Type;

export const ProviderOptionDescriptor = Schema.Union([
  SelectProviderOptionDescriptor,
  BooleanProviderOptionDescriptor,
]);
export type ProviderOptionDescriptor = typeof ProviderOptionDescriptor.Type;

export const ProviderOptionSelection = Schema.Struct({
  id: TrimmedNonEmptyString,
  value: Schema.Union([TrimmedNonEmptyString, Schema.Boolean]),
});
export type ProviderOptionSelection = typeof ProviderOptionSelection.Type;

export const ProviderOptionSelections = Schema.Array(ProviderOptionSelection);
export type ProviderOptionSelections = typeof ProviderOptionSelections.Type;

export const CodexModelOptions = Schema.Struct({
  // Codex runtime discovery can expose early-access effort values outside the built-in enum.
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const ClaudeModelOptions = Schema.Struct({
  thinking: Schema.optional(Schema.Boolean),
  effort: Schema.optional(Schema.Literals(CLAUDE_CODE_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
  autoCompactWindow: Schema.optional(Schema.String),
  // Legacy persisted field. Normalization migrates this to autoCompactWindow.
  contextWindow: Schema.optional(Schema.String),
});
export type ClaudeModelOptions = typeof ClaudeModelOptions.Type;

export const AntigravityModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
});
export type AntigravityModelOptions = typeof AntigravityModelOptions.Type;

export const OpenCodeModelOptions = Schema.Struct({
  variant: Schema.optional(TrimmedNonEmptyString),
  agent: Schema.optional(TrimmedNonEmptyString),
});
export type OpenCodeModelOptions = typeof OpenCodeModelOptions.Type;

export const PiModelOptions = Schema.Struct({
  thinkingLevel: Schema.optional(Schema.Literals(PI_THINKING_LEVEL_OPTIONS)),
});
export type PiModelOptions = typeof PiModelOptions.Type;

export const CursorModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
  fastMode: Schema.optional(Schema.Boolean),
  thinking: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type CursorModelOptions = typeof CursorModelOptions.Type;

export const GrokModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(GROK_REASONING_EFFORT_OPTIONS)),
});
export type GrokModelOptions = typeof GrokModelOptions.Type;

export const DroidModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
});
export type DroidModelOptions = typeof DroidModelOptions.Type;

export const EngineModelOptions = Schema.Struct({
  thinkingLevel: Schema.optional(Schema.Literals(PI_THINKING_LEVEL_OPTIONS)),
});
export type EngineModelOptions = typeof EngineModelOptions.Type;

// Generic options for API-key providers speaking the OpenAI-compatible chat
// protocol (OpenAI, Anthropic, Google, OpenRouter, Ollama). These map to the
// standard chat request fields (`reasoning_effort`, `fast`, `thinking`).
export const ApiModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
  fastMode: Schema.optional(Schema.Boolean),
  thinking: Schema.optional(Schema.Boolean),
});
export type ApiModelOptions = typeof ApiModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  engine: Schema.optional(EngineModelOptions),
  openai: Schema.optional(ApiModelOptions),
  anthropic: Schema.optional(ApiModelOptions),
  google: Schema.optional(ApiModelOptions),
  openrouter: Schema.optional(ApiModelOptions),
  ollama: Schema.optional(ApiModelOptions),
  deepseek: Schema.optional(ApiModelOptions),
  groq: Schema.optional(ApiModelOptions),
  mistral: Schema.optional(ApiModelOptions),
  together: Schema.optional(ApiModelOptions),
  cohere: Schema.optional(ApiModelOptions),
  xai: Schema.optional(ApiModelOptions),
  fireworks: Schema.optional(ApiModelOptions),
  opencodeZen: Schema.optional(ApiModelOptions),
  opencodeGo: Schema.optional(ApiModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

export type ReasoningControlSource = "api-effort" | "provider-setting" | "prompt-prefix";

type EffortOptionBase = {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly isDefault?: true;
};

export type EffortOption =
  | (EffortOptionBase & {
      readonly controlSource?: "api-effort";
      readonly apiEffortValue?: never;
    })
  | (EffortOptionBase & {
      readonly controlSource: "provider-setting";
      readonly apiEffortValue: string;
    })
  | (EffortOptionBase & {
      readonly controlSource: "prompt-prefix";
      readonly apiEffortValue?: never;
    });

export type ContextWindowOption = {
  readonly value: string;
  readonly label: string;
  readonly isDefault?: true;
};

export type ModelCapabilities = {
  readonly optionDescriptors?: readonly ProviderOptionDescriptor[];
  readonly reasoningEffortLevels: readonly EffortOption[];
  readonly supportsFastMode: boolean;
  readonly supportsThinkingToggle: boolean;
  readonly promptInjectedEffortLevels: readonly string[];
  readonly contextWindowOptions: readonly ContextWindowOption[];
  readonly autoCompactWindowOptions?: readonly ContextWindowOption[];
  readonly contextWindowTokens?: number;
  readonly variantOptions?: readonly EffortOption[];
  readonly agentOptions?: readonly EffortOption[];
};

const CODEX_GPT_5_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High", isDefault: true },
    { value: "xhigh", label: "Extra High" },
  ],
  supportsFastMode: true,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

const CODEX_GPT_5_5_CAPABILITIES: ModelCapabilities = {
  ...CODEX_GPT_5_CAPABILITIES,
  reasoningEffortLevels: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium", isDefault: true },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
  ],
};

const GROK_BUILD_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "none", label: "None" },
    { value: "low", label: "Low", isDefault: true },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

// Cursor's live catalog is discovered per session (see CursorAdapter.listModels);
// these entries are the cold-start fallback and mirror the base model ids the
// `cursor-agent` ACP session advertises, with fast/effort/thinking expressed as
// per-model controls rather than the CLI's expanded `-fast`/`-high` slugs.
const CURSOR_EFFORT_LABELS = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
} as const;

type CursorEffortValue = keyof typeof CURSOR_EFFORT_LABELS;

function cursorCapabilities(input?: {
  readonly efforts?: readonly CursorEffortValue[];
  readonly defaultEffort?: CursorEffortValue;
  readonly fast?: boolean;
  readonly thinking?: boolean;
}): ModelCapabilities {
  const efforts = input?.efforts ?? [];
  const defaultEffort =
    input?.defaultEffort ?? (efforts.includes("high") ? "high" : efforts[efforts.length - 1]);
  return {
    reasoningEffortLevels: efforts.map((value) => ({
      value,
      label: CURSOR_EFFORT_LABELS[value],
      ...(value === defaultEffort ? { isDefault: true as const } : {}),
    })),
    supportsFastMode: input?.fast ?? false,
    supportsThinkingToggle: input?.thinking ?? false,
    promptInjectedEffortLevels: [],
    contextWindowOptions: [],
  };
}

const CURSOR_CLAUDE_FULL_CAPABILITIES = cursorCapabilities({
  efforts: ["low", "medium", "high", "xhigh", "max"],
  thinking: true,
  fast: true,
});

const CURSOR_CLAUDE_NO_FAST_CAPABILITIES = cursorCapabilities({
  efforts: ["low", "medium", "high", "xhigh", "max"],
  thinking: true,
});

const CURSOR_GPT_5_6_CAPABILITIES = cursorCapabilities({
  efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  defaultEffort: "medium",
  fast: true,
});

function droidCapabilities(reasoningEffortLevels: readonly EffortOption[]): ModelCapabilities {
  return {
    reasoningEffortLevels,
    supportsFastMode: false,
    supportsThinkingToggle: false,
    promptInjectedEffortLevels: [],
    contextWindowOptions: [],
  };
}

const DROID_CLAUDE_XHIGH_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
]);

const DROID_CLAUDE_MAX_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "max", label: "Max" },
]);

const DROID_CLAUDE_BASIC_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off", isDefault: true },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]);

const DROID_GPT_MEDIUM_CAPABILITIES = droidCapabilities([
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium", isDefault: true },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]);

const DROID_GPT_5_6_CAPABILITIES = droidCapabilities([
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium", isDefault: true },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Maximum" },
]);

const DROID_GPT_PRO_CAPABILITIES = droidCapabilities([
  { value: "medium", label: "Medium", isDefault: true },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]);

const DROID_GPT_HIGH_CAPABILITIES = droidCapabilities([
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
  { value: "xhigh", label: "Extra High" },
]);

const DROID_GPT_5_2_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off" },
  { value: "low", label: "Low", isDefault: true },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]);

const DROID_GEMINI_HIGH_CAPABILITIES = droidCapabilities([
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
]);

const DROID_GEMINI_MINIMAL_CAPABILITIES = droidCapabilities([
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", isDefault: true },
]);

const DROID_CORE_HIGH_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off" },
  { value: "high", label: "High", isDefault: true },
]);

const DROID_CORE_DEEPSEEK_CAPABILITIES = droidCapabilities([
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "high", label: "High", isDefault: true },
  { value: "max", label: "Max" },
]);

const DROID_CORE_HIGH_ONLY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [{ value: "high", label: "High", isDefault: true }],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

// Shared Claude building blocks. Capability shapes repeat across Claude
// generations, so declare them once and let each model entry override only the
// fields that genuinely differ (mirrors the CODEX_GPT_5_* pattern above).
const CLAUDE_AUTO_COMPACT_WINDOWS: readonly ContextWindowOption[] = [
  { value: "200k", label: "200k", isDefault: true },
  { value: "1m", label: "1M (model default)" },
];

function claudeApiEffortOption(
  value: ClaudeApiEffort,
  label: string,
  options: Pick<EffortOption, "isDefault"> = {},
): EffortOption {
  return { value, label, controlSource: "api-effort", ...options };
}

function claudePromptModeOption(value: ClaudePromptMode, label: string): EffortOption {
  return { value, label, controlSource: "prompt-prefix" };
}

function claudeCodeModeOption(
  value: ClaudeCodeMode,
  label: string,
  apiEffortValue: ClaudeApiEffort,
  description: string,
): EffortOption {
  return { value, label, description, apiEffortValue, controlSource: "provider-setting" };
}

// No-fast xhigh ladder: newer Claude Code models with xhigh/max API efforts and
// the ultracode mode setting, but no ultrathink prompt mode or fast mode.
const CLAUDE_NO_FAST_XHIGH_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    claudeApiEffortOption("low", "Low"),
    claudeApiEffortOption("medium", "Medium"),
    claudeApiEffortOption("high", "High", { isDefault: true }),
    claudeApiEffortOption("xhigh", "Extra High"),
    claudeApiEffortOption("max", "Max"),
    claudeCodeModeOption("ultracode", "Ultracode", "xhigh", "xhigh + workflows"),
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
  autoCompactWindowOptions: CLAUDE_AUTO_COMPACT_WINDOWS,
  contextWindowTokens: 1_000_000,
};

const CLAUDE_FABLE_CAPABILITIES: ModelCapabilities = CLAUDE_NO_FAST_XHIGH_CAPABILITIES;

// Opus 5 keeps the Claude 5 ladder (thinking is adaptive, so no ultrathink prompt
// mode) but stays on the Opus fast-mode lane that Fable and Sonnet lack.
const CLAUDE_OPUS_5_CAPABILITIES: ModelCapabilities = {
  ...CLAUDE_NO_FAST_XHIGH_CAPABILITIES,
  supportsFastMode: true,
};

// Full reasoning ladder: xhigh + ultracode + ultrathink (Opus 4.7/4.8).
const CLAUDE_FLAGSHIP_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    claudeApiEffortOption("low", "Low"),
    claudeApiEffortOption("medium", "Medium"),
    claudeApiEffortOption("high", "High", { isDefault: true }),
    claudeApiEffortOption("xhigh", "Extra High"),
    claudeApiEffortOption("max", "Max"),
    claudePromptModeOption("ultrathink", "Ultrathink"),
    claudeCodeModeOption("ultracode", "Ultracode", "xhigh", "xhigh + workflows"),
  ],
  supportsFastMode: true,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: ["ultrathink"],
  contextWindowOptions: [],
  autoCompactWindowOptions: CLAUDE_AUTO_COMPACT_WINDOWS,
  contextWindowTokens: 1_000_000,
};

// Reasoning ladder before xhigh/ultracode landed (Opus 4.6, Sonnet 4.6).
const CLAUDE_EXTENDED_THINKING_CAPABILITIES: ModelCapabilities = {
  ...CLAUDE_FLAGSHIP_CAPABILITIES,
  reasoningEffortLevels: [
    claudeApiEffortOption("low", "Low"),
    claudeApiEffortOption("medium", "Medium"),
    claudeApiEffortOption("high", "High", { isDefault: true }),
    claudeApiEffortOption("max", "Max"),
    claudePromptModeOption("ultrathink", "Ultrathink"),
  ],
};

// Sonnet 5 adds xhigh for long agentic work, while staying in the Sonnet no-fast-mode lane.
const CLAUDE_SONNET_5_CAPABILITIES: ModelCapabilities = CLAUDE_NO_FAST_XHIGH_CAPABILITIES;

type ModelDefinition = {
  readonly slug: string;
  readonly name: string;
  readonly capabilities: ModelCapabilities;
};

// API-key providers expose a live model catalog over HTTP, so their static
// table only pins the default picker entries. No reasoning-effort ladder is
// declared statically; runtime discovery supplies the full catalog.
const API_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/**
 * TODO: This should not be a static array, each provider
 * should return its own model list over the WS API.
 */
export const MODEL_OPTIONS_BY_PROVIDER = {
  engine: [],
  openai: [
    {
      slug: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.6-sol",
      name: "GPT 5.6 Sol",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.5",
      name: "GPT-5.5",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.5-mini",
      name: "GPT-5.5 Mini",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.2",
      name: "GPT 5.2",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.1",
      name: "GPT 5.1",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.1-codex",
      name: "GPT 5.1 Codex",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gpt-5.1-codex-mini",
      name: "GPT 5.1 Codex Mini",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  anthropic: [
    {
      slug: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "claude-opus-5",
      name: "Claude Opus 5",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  google: [
    {
      slug: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro (Preview)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3-flash-preview",
      name: "Gemini 3 Flash (Preview)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-flash-latest",
      name: "Gemini 2.5 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3-pro",
      name: "Gemini 3 Pro",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "gemini-3-flash",
      name: "Gemini 3 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  openrouter: [
    {
      slug: "openrouter/free",
      name: "Free (OpenRouter)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "nvidia/nemotron-3-super-120b-a12b:free",
      name: "Nemotron 3 Super (Free)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "moonshotai/kimi-k2.5",
      name: "Kimi K2.5",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "minimax/minimax-m2.7",
      name: "MiniMax M2.7",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "qwen/qwen3-coder",
      name: "Qwen3 Coder",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek/deepseek-chat-v3.1",
      name: "DeepSeek v3.1",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "openai/gpt-5.5",
      name: "GPT-5.5 (OpenRouter)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "anthropic/claude-sonnet-5",
      name: "Claude Sonnet 5 (OpenRouter)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek/deepseek-chat",
      name: "DeepSeek Chat (OpenRouter)",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  ollama: [
    {
      slug: "llama3.3",
      name: "Llama 3.3",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "qwen2.5-coder",
      name: "Qwen 2.5 Coder",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-r1",
      name: "DeepSeek R1",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  deepseek: [
    {
      slug: "deepseek-chat",
      name: "DeepSeek Chat (V3)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-reasoner",
      name: "DeepSeek Reasoner (R1)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  groq: [
    {
      slug: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B Versatile",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-r1-distill-llama-70b",
      name: "DeepSeek R1 Distill Llama 70B",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "qwen-2.5-coder-32b",
      name: "Qwen 2.5 Coder 32B",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  mistral: [
    {
      slug: "mistral-large-latest",
      name: "Mistral Large",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "codestral-latest",
      name: "Codestral",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "mistral-small-latest",
      name: "Mistral Small",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  together: [
    {
      slug: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      name: "Llama 3.3 70B Turbo",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-ai/DeepSeek-V3",
      name: "DeepSeek V3",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "Qwen/Qwen2.5-Coder-32B-Instruct",
      name: "Qwen 2.5 Coder 32B",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  cohere: [
    {
      slug: "command-r-plus",
      name: "Command R+",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "command-r",
      name: "Command R",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  xai: [
    {
      slug: "grok-3",
      name: "Grok 3",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "grok-3-mini",
      name: "Grok 3 Mini",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "grok-2-1212",
      name: "Grok 2 (1212)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "grok-2-vision-1212",
      name: "Grok 2 Vision",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "grok-2",
      name: "Grok 2",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "grok-beta",
      name: "Grok Beta",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  fireworks: [
    {
      slug: "accounts/fireworks/models/deepseek-v3",
      name: "DeepSeek V3 (Fireworks)",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      name: "Llama 3.3 70B (Fireworks)",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  opencodeZen: [
    {
      slug: "deepseek-v4-flash-free",
      name: "DeepSeek V4 Flash Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "mimo-v2.5-free",
      name: "MiMo V2.5 Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "laguna-s-2.1-free",
      name: "Laguna S 2.1 Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "north-mini-code-free",
      name: "North Mini Code Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "nemotron-3-ultra-free",
      name: "Nemotron 3 Ultra Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "big-pickle",
      name: "Big Pickle Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "ling-3.0-flash-fin-free",
      name: "Ling 3.0 Flash Fin Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "muse-spark-1.2-contributor-free",
      name: "Muse Spark 1.2 Contributor Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "muse-spark-1.3-contributor-free",
      name: "Muse Spark 1.3 Contributor Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "nemotron-3.5-lightning-free",
      name: "Nemotron 3.5 Lightning Free",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  opencodeGo: [
    { slug: "minimax-m3", name: "MiniMax M3", capabilities: API_MODEL_CAPABILITIES },
    { slug: "minimax-m2.7", name: "MiniMax M2.7", capabilities: API_MODEL_CAPABILITIES },
    { slug: "minimax-m2.5", name: "MiniMax M2.5", capabilities: API_MODEL_CAPABILITIES },
    { slug: "kimi-k3", name: "Kimi K3", capabilities: API_MODEL_CAPABILITIES },
    { slug: "kimi-k2.7-code", name: "Kimi K2.7 Code", capabilities: API_MODEL_CAPABILITIES },
    { slug: "kimi-k2.6", name: "Kimi K2.6", capabilities: API_MODEL_CAPABILITIES },
    { slug: "longcat-2.0", name: "LongCat 2.0", capabilities: API_MODEL_CAPABILITIES },
    { slug: "kimi-k2.5", name: "Kimi K2.5", capabilities: API_MODEL_CAPABILITIES },
    { slug: "glm-5.3", name: "GLM 5.3", capabilities: API_MODEL_CAPABILITIES },
    { slug: "glm-5.3-flash", name: "GLM 5.3 Flash", capabilities: API_MODEL_CAPABILITIES },
    { slug: "glm-5.2", name: "GLM 5.2", capabilities: API_MODEL_CAPABILITIES },
    { slug: "glm-5.1", name: "GLM 5.1", capabilities: API_MODEL_CAPABILITIES },
    { slug: "glm-5", name: "GLM 5", capabilities: API_MODEL_CAPABILITIES },
    { slug: "deepseek-v4-pro", name: "DeepSeek V4 Pro", capabilities: API_MODEL_CAPABILITIES },
    { slug: "deepseek-v4-flash", name: "DeepSeek V4 Flash", capabilities: API_MODEL_CAPABILITIES },
    { slug: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.8-max", name: "Qwen 3.8 Max", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.8-flash", name: "Qwen 3.8 Flash", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.7-max", name: "Qwen 3.7 Max", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.7-plus", name: "Qwen 3.7 Plus", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.6-plus", name: "Qwen 3.6 Plus", capabilities: API_MODEL_CAPABILITIES },
    { slug: "qwen3.5-plus", name: "Qwen 3.5 Plus", capabilities: API_MODEL_CAPABILITIES },
    { slug: "mimo-v2.5-pro", name: "MiMo V2.5 Pro", capabilities: API_MODEL_CAPABILITIES },
    { slug: "mimo-v2.5", name: "MiMo V2.5", capabilities: API_MODEL_CAPABILITIES },
    { slug: "mimo-v2-pro", name: "MiMo V2 Pro", capabilities: API_MODEL_CAPABILITIES },
    { slug: "mimo-v2-omni", name: "MiMo V2 Omni", capabilities: API_MODEL_CAPABILITIES },
    { slug: "hy4-preview", name: "HY4 Preview", capabilities: API_MODEL_CAPABILITIES },
    { slug: "hy3", name: "HY3", capabilities: API_MODEL_CAPABILITIES },
    { slug: "hy3-preview", name: "HY3 Preview", capabilities: API_MODEL_CAPABILITIES },
    { slug: "gpt-5.6-luna", name: "GPT-5.6 Luna", capabilities: API_MODEL_CAPABILITIES },
    { slug: "grok-4.6", name: "Grok 4.6", capabilities: API_MODEL_CAPABILITIES },
    { slug: "grok-4.5", name: "Grok 4.5", capabilities: API_MODEL_CAPABILITIES },
    { slug: "muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor", capabilities: API_MODEL_CAPABILITIES },
    { slug: "muse-spark-1.2-contributor", name: "Muse Spark 1.2 Contributor", capabilities: API_MODEL_CAPABILITIES },
    { slug: "omen-alpha", name: "Omen Alpha", capabilities: API_MODEL_CAPABILITIES },
  ],
  custom: [
    {
      slug: "custom-model",
      name: "Custom Model",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  azure: [
    {
      slug: "gpt-5.5",
      name: "GPT-5.5 (Azure)",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  bedrock: [
    {
      slug: "claude-sonnet-5",
      name: "Claude Sonnet 5 (Bedrock)",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  minimax: [
    {
      slug: "minimax-m2.7",
      name: "MiniMax M2.7",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "minimax-m2.5",
      name: "MiniMax M2.5",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "minimax-m2",
      name: "MiniMax M2",
      capabilities: API_MODEL_CAPABILITIES,
    },
    {
      slug: "MiniMax-M2.7",
      name: "MiniMax M2.7",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
  lmstudio: [
    {
      slug: "default",
      name: "Loaded Model",
      capabilities: API_MODEL_CAPABILITIES,
    },
  ],
} as const satisfies Record<ProviderKind, readonly ModelDefinition[]>;
export type ModelOptionsByProvider = typeof MODEL_OPTIONS_BY_PROVIDER;

type BuiltInModelSlug = (typeof MODEL_OPTIONS_BY_PROVIDER)[ProviderKind][number]["slug"];
export type ModelSlug = BuiltInModelSlug | (string & {});

export type ProviderWithDefaultModel = Exclude<ProviderKind, "engine">;

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderWithDefaultModel, ModelSlug> = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-5",
  google: "gemini-2.5-flash",
  openrouter: "openrouter/free",
  ollama: "llama3.3",
  deepseek: "deepseek-chat",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  together: "meta-llama/Llama-3-70b-chat-hf",
  cohere: "command-r-plus",
  xai: "grok-3",
  fireworks: "accounts/fireworks/models/llama-v3-70b-instruct",
  opencodeZen: "deepseek-v4-flash-free",
  opencodeGo: "deepseek-v4-flash",
  custom: "custom-model",
  azure: "gpt-5.5",
  bedrock: "claude-sonnet-5",
  minimax: "minimax-m2.7",
  lmstudio: "default",
};

// Backward compatibility for existing Codex-only call sites.
export const MODEL_OPTIONS = MODEL_OPTIONS_BY_PROVIDER.openai;
export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.openai;
export const DEFAULT_GIT_TEXT_GENERATION_MODEL = "gpt-5.6-luna" as const;
export const DEFAULT_GIT_TEXT_GENERATION_REASONING_EFFORT = "high" as const;

export const MODEL_SLUG_ALIASES_BY_PROVIDER: Record<ProviderKind, Record<string, ModelSlug>> = {
  engine: {},
  openai: {},
  anthropic: {},
  google: {},
  openrouter: {},
  ollama: {},
  deepseek: {},
  groq: {},
  mistral: {},
  together: {},
  cohere: {},
  xai: {},
  fireworks: {},
  opencodeZen: {},
  opencodeGo: {},
  custom: {},
  azure: {},
  bedrock: {},
  minimax: {},
  lmstudio: {},
};

// ── Agent mention aliases ─────────────────────────────────────────────
// Re-exported from agentMentions.ts for backward compatibility
export {
  AGENT_MENTION_ALIASES,
  getAgentMentionAutocompleteAliases,
  getAgentMentionAliases,
  resolveAgentAlias,
  isValidAgentAlias,
  getAgentAliasNames,
  type AgentAliasDefinition,
  type ResolvedAgentAlias,
} from "./agentMentions";

// ── Model capabilities index ──────────────────────────────────────────

export const MODEL_CAPABILITIES_INDEX = Object.fromEntries(
  Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([provider, models]) => [
    provider,
    Object.fromEntries(models.map((m) => [m.slug, m.capabilities])),
  ]),
) as unknown as Record<ProviderKind, Record<string, ModelCapabilities>>;

// ── Provider display names ────────────────────────────────────────────

export type DisplayableProviderKind = Exclude<ProviderKind, "engine">;

export const PROVIDER_DISPLAY_NAMES: Record<DisplayableProviderKind, string> & Partial<Record<ProviderKind, string>> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  deepseek: "DeepSeek",
  groq: "Groq",
  mistral: "Mistral",
  together: "Together",
  cohere: "Cohere",
  xai: "xAI",
  fireworks: "Fireworks",
  opencodeZen: "OpenCode Zen",
  opencodeGo: "OpenCode Go",
  custom: "Custom (OpenAI-compatible)",
  azure: "Azure OpenAI",
  bedrock: "AWS Bedrock",
  minimax: "MiniMax",
  lmstudio: "LM Studio",
};
