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
    },
    {
      name: "gpt-5.6-sol",
      displayName: "GPT 5.6 Sol",
      description: "Frontier agentic coding model used by Dyad Reviewer",
      contextWindow: 372_000,
      temperature: 1,
      dollarSigns: 6,
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
    },
    {
      name: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description: "Anthropic's frontier model for complex coding",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 6,
    },
    {
      name: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      description: "Anthropic's fast, balanced agentic model",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 1,
      dollarSigns: 5,
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
  opencodeZen: [
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
  if (norm === "opencode-zen" || norm === "opencodezen") return BUILT_IN_CATALOG.opencodeZen ?? [];
  if (norm === "opencode-go" || norm === "opencodego") return BUILT_IN_CATALOG.opencodeGo ?? [];
  if (norm === "ollama") return BUILT_IN_CATALOG.ollama ?? [];
  if (norm === "lmstudio") return BUILT_IN_CATALOG.lmstudio ?? [];
  if (norm === "minimax") return BUILT_IN_CATALOG.minimax ?? [];
  if (norm === "custom") return BUILT_IN_CATALOG.custom ?? [];
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
                tag: item.id.includes("free") ? "Free" : undefined,
                tagColor: item.id.includes("free")
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : undefined,
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
