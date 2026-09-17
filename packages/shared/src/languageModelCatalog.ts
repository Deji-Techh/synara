// FILE: languageModelCatalog.ts
// Purpose: Full model catalog for Dyad providers (context windows, tokens, display names).
// Shared between web and server.

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
  type?: "builtin" | "custom";
  /**
   * Taste score 1-10 (UI/UX judgment, code quality, API design, copy).
   * Set only for benchmarked flagships; undefined = unknown, not bad.
   * Mirrors the server catalog (item 29); drives picker badges.
   */
  taste?: number;
}

/**
 * Taste score for a model slug (provider discovery names, OpenAI
 * parameterized suffixes, custom variants). Substring match on benchmarked
 * flagship ids; undefined = unknown. Pure — unit-tested.
 */
export function tasteForModelSlug(slug: string): number | undefined {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const [marker, taste] of [
    ["claude-opus-4-8", 8],
    ["claude-opus-4-6", 8],
    ["claude-sonnet-4-6", 7],
    ["gpt-5.6-sol", 5],
    ["gpt-5.6-luna", 5],
  ] as const) {
    if (normalized.includes(marker)) return taste;
  }
  return undefined;
}

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  openai: [
    {
      name: "gpt-5.6-luna",
      displayName: "GPT 5.6 Luna",
      description: "Fast agentic coding model used by Dyad Explorer and Implementer",
      contextWindow: 372_000,
      temperature: 1,
      dollarSigns: 6,
      taste: 5,
    },
    {
      name: "gpt-5.6-sol",
      displayName: "GPT 5.6 Sol",
      description: "Frontier agentic coding model used by Dyad Reviewer",
      contextWindow: 372_000,
      temperature: 1,
      dollarSigns: 6,
      taste: 5,
    },
    {
      name: "gpt-5.5",
      displayName: "GPT 5.5",
      description: "OpenAI's most capable coding model",
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: "gpt-5.2",
      displayName: "GPT 5.2",
      description: "OpenAI's frontier release",
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1",
      displayName: "GPT 5.1",
      description: "OpenAI's flagship model — fast and conversational",
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex",
      displayName: "GPT 5.1 Codex",
      description: "OpenAI's advanced coding workflows",
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT 5.1 Codex Mini",
      description: "Compact and efficient coding model",
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
    // Carried from the server catalog (donor set) so the unified catalog
    // covers every engine-addressable model — single source of truth.
    {
      name: "gpt-5",
      displayName: "GPT 5",
      description: "OpenAI's flagship model",
      maxOutputTokens: 8192,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-codex",
      displayName: "GPT 5 Codex",
      description: "OpenAI's flagship model optimized for coding",
      maxOutputTokens: 8192,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-mini",
      displayName: "GPT 5 Mini",
      description: "OpenAI's lightweight, but intelligent model",
      maxOutputTokens: 8192,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
  ],
  anthropic: [
    {
      name: "claude-opus-4-8",
      displayName: "Claude Opus 4.8",
      description: "Anthropic's most capable frontier model",
      maxOutputTokens: 64_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
      taste: 8,
    },
    {
      name: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description: "Anthropic's frontier model for complex coding",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
      taste: 8,
    },
    {
      name: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      description: "Anthropic's fast, balanced agentic model",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 5,
      taste: 7,
    },
  ],
  google: [
    {
      name: "gemini-3.8-flash",
      displayName: "Gemini 3.8 Flash",
      description: "Google's ultra-fast, high-throughput frontier Flash model",
      maxOutputTokens: 65_536,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "gemini-3.7-flash",
      displayName: "Gemini 3.7 Flash",
      description: "Google's hybrid reasoning Flash model with verified speed and quality",
      maxOutputTokens: 65_536,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "gemini-3.1-pro-preview",
      displayName: "Gemini 3.1 Pro (Preview)",
      description: "Google's most capable Gemini model",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 4,
    },
    {
      name: "gemini-3.5-flash",
      displayName: "Gemini 3.5 Flash",
      description: "Google's high-quality, high-throughput Flash model",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 3,
    },
    {
      name: "gemini-3-flash-preview",
      displayName: "Gemini 3 Flash (Preview)",
      description: "Powerful coding model with strong reasoning",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Google's Gemini 2.5 Pro model with 1M context",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 3,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Google's Gemini 2.5 Flash model (free tier available)",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 2,
    },
  ],
  openrouter: [
    {
      name: "openrouter/free",
      displayName: "Free (OpenRouter)",
      description: "Auto-routes to the best free OpenRouter model",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "nvidia/nemotron-3-super-120b-a12b:free",
      displayName: "Nemotron 3 Super (Free)",
      description: "NVIDIA 120B MoE model with a 1M context window",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "moonshotai/kimi-k2.5",
      displayName: "Kimi K2.5",
      description: "Moonshot AI's capable coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 1.0,
      dollarSigns: 2,
    },
    {
      name: "minimax/minimax-m2.7",
      displayName: "MiniMax M2.7",
      description: "Enhanced reasoning and code generation",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "qwen/qwen3-coder",
      displayName: "Qwen3 Coder",
      description: "Qwen's flagship coding model",
      maxOutputTokens: 32_000,
      contextWindow: 262_000,
      temperature: 0,
      dollarSigns: 2,
    },
    {
      name: "deepseek/deepseek-chat-v3.1",
      displayName: "DeepSeek v3.1",
      description: "Cost-effective model with strong reasoning",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
      dollarSigns: 2,
    },
    // Carried from the server catalog (donor set) — unified source of truth.
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
  ],
  deepseek: [
    {
      name: "deepseek-chat",
      displayName: "DeepSeek Chat (V3)",
      description: "General-purpose chat and coding model",
      contextWindow: 64_000,
      maxOutputTokens: 8_000,
      temperature: 1.0,
      dollarSigns: 1,
    },
    {
      name: "deepseek-reasoner",
      displayName: "DeepSeek Reasoner (R1)",
      description: "DeepSeek reasoning model with chain-of-thought",
      contextWindow: 64_000,
      maxOutputTokens: 8_000,
      temperature: 0.6,
      dollarSigns: 2,
    },
  ],
  groq: [
    {
      name: "llama-3.3-70b-versatile",
      displayName: "Llama 3.3 70B",
      description: "High-speed inference on Groq LPUs",
      contextWindow: 128_000,
      maxOutputTokens: 32_768,
      temperature: 0.7,
      dollarSigns: 1,
    },
    {
      name: "llama-3.1-8b-instant",
      displayName: "Llama 3.1 8B Instant",
      description: "Ultra-fast low-latency small model",
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      temperature: 0.7,
      dollarSigns: 1,
    },
    {
      name: "qwen-qwq-32b",
      displayName: "Qwen QwQ 32B (Preview)",
      description: "Reasoning-focused open weights model",
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      temperature: 0.6,
      dollarSigns: 1,
    },
  ],
  xai: [
    {
      name: "grok-code-fast-1",
      displayName: "Grok Code Fast",
      description: "Fast, specialized coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "grok-4",
      displayName: "Grok 4",
      description: "xAI's flagship intelligence model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 4,
    },
    // Carried from the server catalog (donor set).
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
  minimax: [
    {
      name: "MiniMax-M2.7",
      displayName: "MiniMax M2.7",
      description: "Flagship model with enhanced reasoning and coding",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
    {
      name: "MiniMax-M2.5",
      displayName: "MiniMax M2.5",
      description: "High performance, fast and agile",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
    // Carried from the server catalog (donor set).
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
      name: "MiniMax-M2.5-highspeed",
      displayName: "MiniMax M2.5 High Speed",
      description: "Same performance, faster and more agile",
      maxOutputTokens: 32_000,
      contextWindow: 204_800,
      temperature: 1.0,
      dollarSigns: 1,
    },
  ],
  // Carried from the server catalog (donor set, verbatim): providers the
  // engine routes to that had no shared entries. This file is the single
  // source of truth — the server catalog re-exports it (009 M1).
  vertex: [
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Vertex Gemini 2.5 Pro",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 0,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Vertex Gemini 2.5 Flash",
      maxOutputTokens: 65_535,
      contextWindow: 1_048_576,
      temperature: 0,
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
  bedrock: [
    {
      name: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      displayName: "Claude 4.5 Sonnet",
      description: "Anthropic's best model for coding (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
    },
  ],
  "opencode-zen": [
    {
      name: "deepseek-v4-flash-free",
      displayName: "DeepSeek V4 Flash (Free)",
      description: "Fast free model through OpenCode Zen; high speed reasoning and coding",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "mimo-v2.5-free",
      displayName: "MiMo V2.5 (Free)",
      description: "Fast conversational and reasoning model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "laguna-s-2.1-free",
      displayName: "Laguna S 2.1 (Free)",
      description: "High-throughput coding model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "north-mini-code-free",
      displayName: "North Mini Code (Free)",
      description: "Compact coding model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "nemotron-3-ultra-free",
      displayName: "Nemotron 3 Ultra (Free)",
      description: "NVIDIA 120B MoE free endpoint through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "big-pickle",
      displayName: "Big Pickle (Free)",
      description: "Stealth coding model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "ling-3.0-flash-fin-free",
      displayName: "Ling 3.0 Flash Fin (Free)",
      description: "High-accuracy quantitative and coding model",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "muse-spark-1.2-contributor-free",
      displayName: "Muse Spark 1.2 Contributor (Free)",
      description: "Fast contributor coding model",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "muse-spark-1.3-contributor-free",
      displayName: "Muse Spark 1.3 Contributor (Free)",
      description: "Enhanced contributor coding model",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "nemotron-3.5-lightning-free",
      displayName: "Nemotron 3.5 Lightning (Free)",
      description: "Ultra-low-latency NVIDIA inference",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      description: "Frontier coding and reasoning model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 1,
    },
    {
      name: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      description: "Fast high-speed reasoning and coding model through OpenCode Zen",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
  ],
  opencodeGo: [
    {
      name: "minimax-m3",
      displayName: "MiniMax M3",
      description: "MiniMax M3 reasoning and coding model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "minimax-m2.7",
      displayName: "MiniMax M2.7",
      description: "MiniMax high-speed reasoning model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "minimax-m2.5",
      displayName: "MiniMax M2.5",
      description: "MiniMax fast coding and conversation",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "kimi-k3",
      displayName: "Kimi K3",
      description: "Moonshot Kimi K3 long-context reasoning model",
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "kimi-k2.7-code",
      displayName: "Kimi K2.7 Code",
      description: "Moonshot Kimi code-specialized model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "kimi-k2.6",
      displayName: "Kimi K2.6",
      description: "Moonshot Kimi K2.6 assistant",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "longcat-2.0",
      displayName: "LongCat 2.0",
      description: "LongCat ultra-long context reasoning",
      contextWindow: 256_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "kimi-k2.5",
      displayName: "Kimi K2.5",
      description: "Moonshot Kimi K2.5 fast reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "glm-5.3",
      displayName: "GLM 5.3",
      description: "Zhipu AI flagship GLM 5.3 model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "glm-5.3-flash",
      displayName: "GLM 5.3 Flash",
      description: "Zhipu AI ultra-low-latency GLM 5.3",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "glm-5.2",
      displayName: "GLM 5.2",
      description: "Zhipu AI GLM 5.2 general intelligence",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "glm-5.1",
      displayName: "GLM 5.1",
      description: "Zhipu AI GLM 5.1 assistant",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "glm-5",
      displayName: "GLM 5",
      description: "Zhipu AI foundation GLM 5 model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      description: "DeepSeek next-gen flagship coding and reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      description: "DeepSeek ultra-fast high-throughput reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "deepseek-v4-flash-vision-exp",
      displayName: "DeepSeek V4 Flash Vision Exp",
      description: "Experimental multimodal vision reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.8-max",
      displayName: "Qwen 3.8 Max",
      description: "Alibaba Qwen flagship 3.8 coding intelligence",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.8-flash",
      displayName: "Qwen 3.8 Flash",
      description: "Alibaba Qwen 3.8 low-latency assistant",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.7-max",
      displayName: "Qwen 3.7 Max",
      description: "Alibaba Qwen 3.7 high-capability model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.7-plus",
      displayName: "Qwen 3.7 Plus",
      description: "Alibaba Qwen 3.7 Plus balanced performance",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.6-plus",
      displayName: "Qwen 3.6 Plus",
      description: "Alibaba Qwen 3.6 Plus reasoning model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "qwen3.5-plus",
      displayName: "Qwen 3.5 Plus",
      description: "Alibaba Qwen 3.5 general assistant",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "mimo-v2.5-pro",
      displayName: "MiMo V2.5 Pro",
      description: "MiMo advanced architecture coding model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "mimo-v2.5",
      displayName: "MiMo V2.5",
      description: "MiMo ultra-fast code generation",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 0,
      tag: "Free",
      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: "mimo-v2-pro",
      displayName: "MiMo V2 Pro",
      description: "MiMo V2 Pro high capability model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "mimo-v2-omni",
      displayName: "MiMo V2 Omni",
      description: "MiMo multimodal omni reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "hy4-preview",
      displayName: "HY4 Preview",
      description: "Tencent Hunyuan 4 Preview next-gen reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "hy3",
      displayName: "HY3",
      description: "Tencent Hunyuan 3 large model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "hy3-preview",
      displayName: "HY3 Preview",
      description: "Tencent Hunyuan 3 Preview",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "gpt-5.6-luna",
      displayName: "GPT-5.6 Luna",
      description: "Next-generation fast intelligence model",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "grok-4.6",
      displayName: "Grok 4.6",
      description: "xAI Grok 4.6 frontier code and reasoning",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "grok-4.5",
      displayName: "Grok 4.5",
      description: "xAI Grok 4.5 assistant",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "muse-spark-1.3-contributor",
      displayName: "Muse Spark 1.3 Contributor",
      description: "Muse Spark 1.3 enhanced contributor coding",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "muse-spark-1.2-contributor",
      displayName: "Muse Spark 1.2 Contributor",
      description: "Muse Spark 1.2 fast contributor coding",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
    {
      name: "omen-alpha",
      displayName: "Omen Alpha",
      description: "Experimental Omen Alpha coding intelligence",
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      dollarSigns: 1,
    },
  ],
  ollama: [
    {
      name: "qwen2.5-coder:latest",
      displayName: "Qwen 2.5 Coder",
      description: "Local Ollama model",
      contextWindow: 32_000,
      maxOutputTokens: 8_000,
      temperature: 0.2,
      dollarSigns: 0,
    },
    {
      name: "llama3.3:latest",
      displayName: "Llama 3.3",
      description: "Local Ollama model",
      contextWindow: 32_000,
      maxOutputTokens: 8_000,
      temperature: 0.7,
      dollarSigns: 0,
    },
  ],
  lmstudio: [
    {
      name: "default",
      displayName: "Loaded Model",
      description: "The model currently active in LM Studio",
      contextWindow: 32_000,
      maxOutputTokens: 8_000,
      temperature: 0.7,
      dollarSigns: 0,
    },
  ],
  custom: [
    {
      name: "custom-model",
      displayName: "Custom Model",
      description: "Model provided by your OpenAI-compatible endpoint",
      contextWindow: 128_000,
      maxOutputTokens: 8_000,
      temperature: 0.7,
      dollarSigns: 0,
    },
  ],
};

export const BUILT_IN_CATALOG = MODEL_OPTIONS;

/**
 * Get built-in models for a provider.
 */
export function getBuiltInModelsForProvider(providerId: string): ModelOption[] {
  const norm = providerId.toLowerCase().replace(/_/g, "-");
  if (norm === "openai") return BUILT_IN_CATALOG.openai ?? [];
  if (norm === "anthropic") return BUILT_IN_CATALOG.anthropic ?? [];
  if (norm === "google") return BUILT_IN_CATALOG.google ?? [];
  if (norm === "groq") return BUILT_IN_CATALOG.groq ?? [];
  if (norm === "xai") return BUILT_IN_CATALOG.xai ?? [];
  if (norm === "deepseek") return BUILT_IN_CATALOG.deepseek ?? [];
  if (norm === "openrouter") return BUILT_IN_CATALOG.openrouter ?? [];
  if (norm === "opencode-zen" || norm === "opencodezen")
    return BUILT_IN_CATALOG["opencode-zen"] ?? [];
  if (norm === "opencode-go" || norm === "opencodego") return BUILT_IN_CATALOG.opencodeGo ?? [];
  if (norm === "ollama") return BUILT_IN_CATALOG.ollama ?? [];
  if (norm === "lmstudio") return BUILT_IN_CATALOG.lmstudio ?? [];
  if (norm === "minimax") return BUILT_IN_CATALOG.minimax ?? [];
  if (norm === "custom") return BUILT_IN_CATALOG.custom ?? [];
  if (norm === "azure") return BUILT_IN_CATALOG.azure ?? [];
  if (norm === "bedrock") return BUILT_IN_CATALOG.bedrock ?? [];
  if (norm === "vertex") return BUILT_IN_CATALOG.vertex ?? [];
  if (norm === "auto") return BUILT_IN_CATALOG.auto ?? [];
  return [];
}

/**
 * Format context window nicely (e.g. 1048576 -> 1.0M, 200000 -> 200k).
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
}

/**
 * Format max output tokens nicely (e.g. 65536 -> 66k, 8192 -> 8k).
 */
export function formatOutputTokens(tokens?: number): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
}

export const OPENCODE_ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";
export const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";

/**
 * Known OpenCode Zen free-tier model ids (donor
 * OPENCODE_ZEN_FREE_MODEL_IDS verbatim). The live `/models` endpoint may
 * add more — `isOpenCodeZenFreeModelId` also matches the `-free` suffix so
 * newly listed free models are recognized without a catalog update.
 */
export const OPENCODE_ZEN_FREE_MODEL_IDS = [
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "laguna-s-2.1-free",
  "north-mini-code-free",
  "nemotron-3-ultra-free",
  "big-pickle",
] as const;

/** Whether a model id is an OpenCode Zen free-tier model. */
export function isOpenCodeZenFreeModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if ((OPENCODE_ZEN_FREE_MODEL_IDS as readonly string[]).includes(id)) return true;
  return id.endsWith("-free");
}

/**
 * Fetch live dynamic models with fallback to built-ins.
 */
export async function fetchRemoteCatalogModels(
  providerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelOption[]> {
  const norm = providerId.toLowerCase().replace(/_/g, "-");
  const isOpenCodeZen = norm === "opencode-zen" || norm === "opencodezen";
  const isOpenCodeGo = norm === "opencode-go" || norm === "opencodego";

  if (isOpenCodeZen || isOpenCodeGo) {
    const url = isOpenCodeGo ? OPENCODE_GO_MODELS_URL : OPENCODE_ZEN_MODELS_URL;
    const providerKey = isOpenCodeGo ? "opencodeGo" : "opencodeZen";
    const providerLabel = isOpenCodeGo ? "OpenCode Go" : "OpenCode Zen";

    try {
      const res = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const payload = (await res.json()) as { data?: Array<{ id?: string }> };
        if (Array.isArray(payload.data) && payload.data.length > 0) {
          const builtins = getBuiltInModelsForProvider(providerKey);
          return payload.data
            .filter((item): item is { id: string } => typeof item?.id === "string")
            .map((item) => {
              const matched = builtins.find((b) => b.name === item.id);
              if (matched) return matched;
              return {
                name: item.id,
                displayName: item.id
                  .replace(/-free$/, "")
                  .replace(/[-_]/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                description: `Live model through ${providerLabel}`,
                contextWindow: 128_000,
                maxOutputTokens: 32_000,
                dollarSigns: item.id.includes("free") || item.id.includes("flash") ? 0 : 1,
                ...(item.id.includes("free")
                  ? {
                      tag: "Free",
                      tagColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    }
                  : {}),
                type: "builtin" as const,
              };
            });
        }
      }
    } catch {
      // Return fallback
    }
    return getBuiltInModelsForProvider(providerKey);
  }
  return getBuiltInModelsForProvider(providerId);
}

// ---------------------------------------------------------------------------
// Remote builtin catalog (api.dyad.sh) + model aliases.
// Donor: dyad x caide remote_language_model_catalog.ts (behavior port).
// Adaptations: no zod (hand-rolled shape guards — shared has no zod dep),
// no electron-log (console), no gateway/Pro fields (free-entirely), env read
// via globalThis (browser-safe). Theme/help-bot aliases resolve against
// user-keyed models (014); the table itself is provider-agnostic data.
// ---------------------------------------------------------------------------

export const REMOTE_CATALOG_URL_DEFAULT = "https://api.dyad.sh/v1/language-model-catalog";
const REMOTE_CATALOG_TIMEOUT_MS = 5_000;
const REMOTE_CATALOG_TTL_MS = 60 * 60 * 1000;
const REMOTE_CATALOG_FALLBACK_TTL_MS = 30 * 1000;

function getRemoteCatalogUrl(): string {
  try {
    const env = (
      globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    if (env?.DYAD_LANGUAGE_MODEL_CATALOG_URL) return env.DYAD_LANGUAGE_MODEL_CATALOG_URL;
  } catch {
    // browser / restricted runtimes: fall through to the default URL
  }
  return REMOTE_CATALOG_URL_DEFAULT;
}

export const KNOWN_BUILTIN_MODEL_ALIASES = [
  "dyad/theme-generator/google",
  "dyad/theme-generator/anthropic",
  "dyad/theme-generator/openai",
  "caide/theme-generator/chatgpt",
  "caide/theme-generator/deepseek",
  "dyad/auto/openai",
  "dyad/auto/anthropic",
  "dyad/auto/google",
  "dyad/auto/openrouter",
  "dyad/help-bot/default",
] as const;

export type BuiltinModelAlias = (typeof KNOWN_BUILTIN_MODEL_ALIASES)[number];

export interface ThemeGenerationModelOption {
  id: string;
  label: string;
}

export interface RemoteCatalogProvider {
  id: string;
  name: string;
  hasFreeTier?: boolean;
  websiteUrl?: string;
}

export interface BuiltinModelAliasRecord {
  id: string;
  resolvedModel: { providerId: string; apiName: string };
  displayName?: string;
  purpose?: "theme-generation" | "auto-mode" | "help-bot";
}

export interface BuiltinLanguageModelCatalog {
  providers: RemoteCatalogProvider[];
  modelsByProvider: Record<string, ModelOption[]>;
  aliases: BuiltinModelAliasRecord[];
  themeGenerationOptions: ThemeGenerationModelOption[];
  expiresAt: number;
  source: "fallback" | "remote";
  version?: string;
}

const DEFAULT_THEME_GENERATION_OPTIONS: ThemeGenerationModelOption[] = [
  { id: "dyad/theme-generator/google", label: "Google" },
  { id: "dyad/theme-generator/anthropic", label: "Anthropic" },
  { id: "dyad/theme-generator/openai", label: "OpenAI" },
  { id: "caide/theme-generator/chatgpt", label: "ChatGPT" },
  { id: "caide/theme-generator/deepseek", label: "DeepSeek" },
];

/** Direct resolutions that never need the network (donor CAIDE_THEME_ALIASES). */
const CAIDE_THEME_ALIASES: Record<string, { providerId: string; apiName: string }> = {
  "caide/theme-generator/chatgpt": { providerId: "chatgpt", apiName: "gpt-5.5" },
  "caide/theme-generator/deepseek": { providerId: "deepseek", apiName: "deepseek-v4-pro" },
};

const FALLBACK_ALIASES: BuiltinModelAliasRecord[] = [
  {
    id: "dyad/theme-generator/google",
    resolvedModel: { providerId: "google", apiName: "gemini-3.1-pro-preview" },
    displayName: "Google",
    purpose: "theme-generation",
  },
  {
    id: "dyad/theme-generator/anthropic",
    resolvedModel: { providerId: "anthropic", apiName: "claude-opus-4-6" },
    displayName: "Anthropic",
    purpose: "theme-generation",
  },
  {
    id: "dyad/theme-generator/openai",
    resolvedModel: { providerId: "openai", apiName: "gpt-5.2" },
    displayName: "OpenAI",
    purpose: "theme-generation",
  },
  {
    id: "dyad/auto/openai",
    resolvedModel: { providerId: "openai", apiName: "gpt-5.5" },
    displayName: "Auto OpenAI",
    purpose: "auto-mode",
  },
  {
    id: "dyad/auto/anthropic",
    resolvedModel: { providerId: "anthropic", apiName: "claude-opus-4-8" },
    displayName: "Auto Anthropic",
    purpose: "auto-mode",
  },
  {
    id: "dyad/auto/google",
    resolvedModel: { providerId: "google", apiName: "gemini-3.5-flash" },
    displayName: "Auto Google",
    purpose: "auto-mode",
  },
  {
    id: "dyad/auto/openrouter",
    resolvedModel: { providerId: "openrouter", apiName: "nvidia/nemotron-3-super-120b-a12b:free" },
    displayName: "Auto OpenRouter",
    purpose: "auto-mode",
  },
  {
    id: "dyad/help-bot/default",
    resolvedModel: { providerId: "openai", apiName: "gpt-5-nano" },
    displayName: "Help Bot",
    purpose: "help-bot",
  },
];

function buildFallbackCatalog(): BuiltinLanguageModelCatalog {
  const providers: RemoteCatalogProvider[] = Object.keys(MODEL_OPTIONS).map((id) => ({
    id,
    name: id,
  }));
  const modelsByProvider: Record<string, ModelOption[]> = {};
  for (const [providerId, models] of Object.entries(MODEL_OPTIONS)) {
    modelsByProvider[providerId] = models.map((m) => ({ ...m }));
  }
  return {
    providers,
    modelsByProvider,
    aliases: FALLBACK_ALIASES.map((a) => ({ ...a })),
    themeGenerationOptions: [...DEFAULT_THEME_GENERATION_OPTIONS],
    expiresAt: Date.now() + REMOTE_CATALOG_FALLBACK_TTL_MS,
    source: "fallback",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Shape-guard a remote catalog payload; null when it fails (→ fallback). Exported for tests. */
export function parseRemoteCatalogResponse(raw: unknown): {
  version: string;
  expiresAt?: string;
  providers: RemoteCatalogProvider[];
  modelsByProvider: Record<string, ModelOption[]>;
  aliases: BuiltinModelAliasRecord[];
  themeGenerationOptions: ThemeGenerationModelOption[];
} | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.version !== "string") return null;
  if (!Array.isArray(raw.providers) || !isRecord(raw.modelsByProvider)) return null;
  if (!Array.isArray(raw.aliases)) return null;
  try {
    const providers: RemoteCatalogProvider[] = raw.providers.map((p) => {
      if (!isRecord(p) || typeof p.id !== "string") throw new Error("bad provider");
      return {
        id: p.id,
        name: asOptionalString(p.displayName) ?? p.id,
        ...(typeof p.hasFreeTier === "boolean" ? { hasFreeTier: p.hasFreeTier } : {}),
        ...(asOptionalString(p.websiteUrl) ? { websiteUrl: asOptionalString(p.websiteUrl) as string } : {}),
      };
    });
    const modelsByProvider: Record<string, ModelOption[]> = {};
    for (const [providerId, models] of Object.entries(raw.modelsByProvider)) {
      if (!Array.isArray(models)) throw new Error("bad models");
      modelsByProvider[providerId] = models.map((m) => {
        if (!isRecord(m) || typeof m.apiName !== "string") throw new Error("bad model");
        return {
          name: m.apiName,
          displayName: asOptionalString(m.displayName) ?? m.apiName,
          description: asOptionalString(m.description) ?? "",
          ...(asOptionalString(m.tag) ? { tag: m.tag as string } : {}),
          ...(asOptionalString(m.tagColor) ? { tagColor: m.tagColor as string } : {}),
          ...(asOptionalNumber(m.dollarSigns) !== undefined
            ? { dollarSigns: m.dollarSigns as number }
            : {}),
          ...(asOptionalNumber(m.temperature) !== undefined
            ? { temperature: m.temperature as number }
            : {}),
          ...(asOptionalNumber(m.maxOutputTokens) !== undefined
            ? { maxOutputTokens: m.maxOutputTokens as number }
            : {}),
          ...(asOptionalNumber(m.contextWindow) !== undefined
            ? { contextWindow: m.contextWindow as number }
            : {}),
        };
      });
    }
    if (modelsByProvider.auto?.length === 0 || !modelsByProvider.auto) {
      modelsByProvider.auto = (MODEL_OPTIONS.auto ?? []).map((m) => ({ ...m }));
    }
    const aliases: BuiltinModelAliasRecord[] = raw.aliases.map((a) => {
      if (!isRecord(a) || typeof a.id !== "string" || !isRecord(a.resolvedModel)) {
        throw new Error("bad alias");
      }
      const r = a.resolvedModel;
      if (typeof r.providerId !== "string" || typeof r.apiName !== "string") {
        throw new Error("bad alias target");
      }
      const purpose = a.purpose;
      return {
        id: a.id,
        resolvedModel: { providerId: r.providerId, apiName: r.apiName },
        ...(asOptionalString(a.displayName) ? { displayName: a.displayName as string } : {}),
        ...(purpose === "theme-generation" || purpose === "auto-mode" || purpose === "help-bot"
          ? { purpose }
          : {}),
      };
    });
    // Merge required builtin aliases the remote catalog may omit (donor).
    const remoteIds = new Set(aliases.map((a) => a.id));
    for (const fallback of FALLBACK_ALIASES) {
      if (!remoteIds.has(fallback.id)) aliases.push({ ...fallback });
    }
    let themeGenerationOptions = [...DEFAULT_THEME_GENERATION_OPTIONS];
    const curated = isRecord(raw.curatedSelections)
      ? raw.curatedSelections.themeGenerationOptions
      : undefined;
    if (Array.isArray(curated) && curated.length > 0) {
      const parsed = curated.filter(
        (o): o is ThemeGenerationModelOption =>
          isRecord(o) && typeof o.id === "string" && typeof o.label === "string",
      );
      if (parsed.length > 0) themeGenerationOptions = parsed;
    }
    return {
      version: raw.version,
      ...(asOptionalString(raw.expiresAt) ? { expiresAt: raw.expiresAt as string } : {}),
      providers,
      modelsByProvider,
      aliases,
      themeGenerationOptions,
    };
  } catch {
    return null;
  }
}

let builtinCatalogCache: BuiltinLanguageModelCatalog | null = null;
let builtinCatalogFetchPromise: Promise<BuiltinLanguageModelCatalog> | null = null;

/** Test-only: drop cached catalog state between cases. */
export function resetBuiltinCatalogForTests(): void {
  builtinCatalogCache = null;
  builtinCatalogFetchPromise = null;
}

async function fetchRemoteCatalog(): Promise<BuiltinLanguageModelCatalog | null> {
  const catalogUrl = getRemoteCatalogUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(catalogUrl, { signal: controller.signal });
    if (!response.ok) return null;
    const parsed = parseRemoteCatalogResponse(await response.json());
    if (!parsed) return null;
    const parsedExpiresAt = parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : NaN;
    // Local auto models always present (donor: remote `auto` may be empty).
    if (!parsed.modelsByProvider.auto || parsed.modelsByProvider.auto.length === 0) {
      parsed.modelsByProvider.auto = (MODEL_OPTIONS.auto ?? []).map((m) => ({ ...m }));
    }
    return {
      providers: parsed.providers,
      modelsByProvider: parsed.modelsByProvider,
      aliases: parsed.aliases,
      themeGenerationOptions: parsed.themeGenerationOptions,
      expiresAt:
        Number.isFinite(parsedExpiresAt) && parsedExpiresAt > Date.now()
          ? parsedExpiresAt
          : Date.now() + REMOTE_CATALOG_TTL_MS,
      source: "remote",
      version: parsed.version,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function triggerBackgroundRefresh(): void {
  if (builtinCatalogFetchPromise) return;
  builtinCatalogFetchPromise = (async () => {
    try {
      builtinCatalogCache = (await fetchRemoteCatalog()) ?? buildFallbackCatalog();
      return builtinCatalogCache;
    } finally {
      builtinCatalogFetchPromise = null;
    }
  })();
}

/**
 * Builtin catalog with stale-while-revalidate: fresh cache wins; stale cache
 * serves immediately while a background refresh runs; cold start waits for
 * the first fetch so callers never pin fallback data.
 */
export async function getBuiltinLanguageModelCatalog(): Promise<BuiltinLanguageModelCatalog> {
  if (builtinCatalogCache && builtinCatalogCache.expiresAt > Date.now()) {
    return builtinCatalogCache;
  }
  if (builtinCatalogCache) {
    triggerBackgroundRefresh();
    return builtinCatalogCache;
  }
  if (!builtinCatalogFetchPromise) {
    builtinCatalogFetchPromise = (async () => {
      try {
        builtinCatalogCache = (await fetchRemoteCatalog()) ?? buildFallbackCatalog();
        return builtinCatalogCache;
      } finally {
        builtinCatalogFetchPromise = null;
      }
    })();
  }
  return builtinCatalogFetchPromise;
}

/** Theme-generation options, always containing the required defaults. */
export async function getThemeGenerationModelOptions(): Promise<ThemeGenerationModelOption[]> {
  const catalog = await getBuiltinLanguageModelCatalog();
  const options = [...catalog.themeGenerationOptions];
  for (const required of DEFAULT_THEME_GENERATION_OPTIONS) {
    if (!options.some((o) => o.id === required.id)) options.push(required);
  }
  return options;
}

/** Resolve a builtin alias (theme/auto/help-bot) to a provider model. */
export async function resolveBuiltinModelAlias(
  aliasId: BuiltinModelAlias | string,
): Promise<{ providerId: string; apiName: string } | null> {
  const direct = CAIDE_THEME_ALIASES[aliasId];
  if (direct) return direct;
  const catalog = await getBuiltinLanguageModelCatalog();
  return catalog.aliases.find((a) => a.id === aliasId)?.resolvedModel ?? null;
}
