// FILE: catalog.ts
// Purpose: Full model catalog (provider → models with context windows,
// temperature, cost hints). Everything is free of Pro gating: no gateway
// prefixes, no quota-gated entries, no subscription-only models.
// Donor: dyad src/ipc/shared/language_model_constants.ts MODEL_OPTIONS
// (verbatim) EXCEPT the `auto/free-pro` entry ("5 free messages per day for
// Dyad Pro users") which required a paid gateway — removed per
// free-entirely directive. `dollarSigns` are kept as informational cost hints
// for the user's own keys, not as access gates.

export interface ModelOption {
  name: string;
  displayName: string;
  description: string;
  dollarSigns?: number;
  temperature?: number;
  tag?: string;
  tagColor?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
  effortSettings?: {
    defaultEffortLevel: string;
    possibleEffortLevels: string[];
  };
}

export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const GPT_5_5_MODEL_NAME = "gpt-5.5";
export const GPT_5_6_LUNA_MODEL_NAME = "gpt-5.6-luna";
export const GPT_5_6_SOL_MODEL_NAME = "gpt-5.6-sol";
export const SONNET_4_6 = "claude-sonnet-4-6";
export const OPUS_4_6 = "claude-opus-4-6";
export const OPUS_4_8 = "claude-opus-4-8";
export const GEMINI_3_5_FLASH = "gemini-3.5-flash";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";
export const GEMINI_3_1_PRO_PREVIEW = "gemini-3.1-pro-preview";
export const NEMOTRON_3_SUPER_FREE = "nvidia/nemotron-3-super-120b-a12b:free";
export const GPT_5_NANO = "gpt-5-nano";

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  openai: [
    {
      name: GPT_5_6_LUNA_MODEL_NAME,
      displayName: "GPT 5.6 Luna",
      description:
        "Fast agentic coding model used by Dyad Explorer and Implementer",
      contextWindow: 372_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: GPT_5_6_SOL_MODEL_NAME,
      displayName: "GPT 5.6 Sol",
      description: "Frontier agentic coding model used by Dyad Reviewer",
      contextWindow: 372_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: GPT_5_5_MODEL_NAME,
      displayName: "GPT 5.5",
      description: "OpenAI's most capable coding model",
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: GPT_5_2_MODEL_NAME,
      displayName: "GPT 5.2",
      description: "OpenAI's latest model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1",
      displayName: "GPT 5.1",
      description:
        "OpenAI's flagship model- smarter, faster, and more conversational",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex",
      displayName: "GPT 5.1 Codex",
      description: "OpenAI's advanced coding workflows",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT 5.1 Codex Mini",
      description: "OpenAI's compact and efficient coding model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
    {
      name: "gpt-5",
      displayName: "GPT 5",
      description: "OpenAI's flagship model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-codex",
      displayName: "GPT 5 Codex",
      description: "OpenAI's flagship model optimized for coding",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-mini",
      displayName: "GPT 5 Mini",
      description: "OpenAI's lightweight, but intelligent model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
  ],
  anthropic: [
    {
      name: OPUS_4_8,
      displayName: "Claude Opus 4.8",
      description: "Anthropic most capable model",
      maxOutputTokens: 64_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description:
        "Anthropic's best model for coding (note: this model is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: SONNET_4_6,
      displayName: "Claude Sonnet 4.6",
      description:
        "Anthropic's fast and intelligent model (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 5,
    },
  ],
  google: [
    {
      name: "gemini-3.1-pro-preview",
      displayName: "Gemini 3.1 Pro (Preview)",
      description: "Google's most capable Gemini model",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 4,
    },
    {
      name: GEMINI_3_5_FLASH,
      displayName: "Gemini 3.5 Flash",
      description: "Google's high-quality Flash model",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 3,
    },
    {
      name: GEMINI_3_FLASH,
      displayName: "Gemini 3 Flash (Preview)",
      description: "Powerful coding model at a good price",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Google's Gemini 2.5 Pro model",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 3,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Google's Gemini 2.5 Flash model (free tier available)",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 2,
    },
  ],
  vertex: [
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Vertex Gemini 2.5 Pro",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Vertex Gemini 2.5 Flash",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
    },
  ],
  openrouter: [
    {
      name: "openrouter/free",
      displayName: "Free (OpenRouter)",
      description:
        "Uses one of the free OpenRouter models (data may be used for training)",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: NEMOTRON_3_SUPER_FREE,
      displayName: "Nemotron 3 Super (Free)",
      description: "NVIDIA's open 120B MoE model with a 1M context window",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "moonshotai/kimi-k2.5",
      displayName: "Kimi K2.5",
      description: "Moonshot AI's latest and most capable model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "minimax/minimax-m2.7",
      displayName: "MiniMax M2.7",
      description: "Latest flagship model with enhanced reasoning and coding",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "minimax/minimax-m2.5",
      displayName: "MiniMax M2.5",
      description: "Strong cost-effective model for real-world productivity",
      maxOutputTokens: 32_000,
      contextWindow: 196_608,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "z-ai/glm-5",
      displayName: "GLM 5",
      description: "Z-AI's best coding model",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0.7,
      dollarSigns: 2,
    },
    {
      name: "z-ai/glm-4.7",
      displayName: "GLM 4.7",
      description: "Z-AI's coding model",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0.7,
      dollarSigns: 2,
    },
    {
      name: "qwen/qwen3-coder",
      displayName: "Qwen3 Coder",
      description: "Qwen's best coding model",
      maxOutputTokens: 32_000,
      contextWindow: 262_000,
      temperature: 0,
      dollarSigns: 2,
    },
    {
      name: "deepseek/deepseek-chat-v3.1",
      displayName: "DeepSeek v3.1",
      description: "Strong cost-effective model with optional thinking",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
      dollarSigns: 2,
    },
  ],
  auto: [
    {
      name: "auto",
      displayName: "Auto",
      description: "Automatically selects the best model",
      tag: "Default",
      tagColor: "bg-primary text-primary-foreground",
      maxOutputTokens: 32_000,
      contextWindow: 250_000,
      temperature: 0,
    },
    {
      name: "free",
      displayName: "Free (OpenRouter)",
      description: "Selects from one of the free OpenRouter models",
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
    },
    {
      name: "value",
      displayName: "Super Value",
      description: "Uses the most cost-effective models available",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 1,
      tag: "Budget",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
  ],
  azure: [
    {
      name: "gpt-5.1",
      displayName: "GPT-5.1",
      description: "Azure OpenAI GPT-5.1 model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5.1-codex",
      displayName: "GPT-5.1 Codex",
      description: "Azure OpenAI GPT-5.1 Codex model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT-5.1 Codex Mini",
      description: "Azure OpenAI GPT-5.1 Codex Mini model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Azure OpenAI GPT-5 Codex model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5",
      displayName: "GPT-5",
      description: "Azure OpenAI GPT-5 model with reasoning capabilities",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Azure OpenAI GPT-5 Mini model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Azure OpenAI GPT-5 Nano model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-chat",
      displayName: "GPT-5 Chat",
      description: "Azure OpenAI GPT-5 Chat model",
      contextWindow: 128_000,
      temperature: 1,
    },
  ],
  xai: [
    {
      name: "grok-code-fast-1",
      displayName: "Grok Code Fast",
      description: "Fast coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "grok-4",
      displayName: "Grok 4",
      description: "Most capable coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 4,
    },
    {
      name: "grok-3",
      displayName: "Grok 3",
      description: "Powerful coding model",
      maxOutputTokens: 32_000,
      contextWindow: 131_072,
      temperature: 0,
      dollarSigns: 4,
    },
  ],
  bedrock: [
    {
      name: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      displayName: "Claude 4.5 Sonnet",
      description:
        "Anthropic's best model for coding (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
    },
  ],
  minimax: [
    {
      name: "MiniMax-M2.7",
      displayName: "MiniMax M2.7",
      description: "Latest flagship model with enhanced reasoning and coding",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
    {
      name: "MiniMax-M2.7-highspeed",
      displayName: "MiniMax M2.7 High Speed",
      description: "High-speed version of M2.7 for low-latency scenarios",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
    {
      name: "MiniMax-M2.5",
      displayName: "MiniMax M2.5",
      description: "Peak Performance. Ultimate Value. Master the Complex",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
    {
      name: "MiniMax-M2.5-highspeed",
      displayName: "MiniMax M2.5 High Speed",
      description: "Same performance, faster and more agile",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
  ],
};

export const FREE_OPENROUTER_MODEL_NAMES = MODEL_OPTIONS.openrouter
  .filter(
    (model) => model.name.endsWith(":free") || model.name.endsWith("/free"),
  )
  .map((model) => model.name);

/** Find a model's catalog entry (limits, temperature) by provider + name. */
export function findModelOption(
  providerId: string,
  modelName: string,
): ModelOption | undefined {
  return MODEL_OPTIONS[providerId]?.find((m) => m.name === modelName);
}

/** Context window for budget checks; defaults to 128k when unknown. */
export function getContextWindow(
  providerId: string,
  modelName: string,
): number {
  return findModelOption(providerId, modelName)?.contextWindow ?? 128_000;
}
