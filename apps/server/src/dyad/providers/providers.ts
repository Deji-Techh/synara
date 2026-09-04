// FILE: providers.ts
// Purpose: Provider registry — every provider Caide connects to DIRECTLY with
// the user's own key. No gateway, no proxy, no subscription, no quotas.
// Donor: dyad CLOUD_PROVIDERS + LOCAL_PROVIDERS + PROVIDER_TO_ENV_VAR
// (language_model_constants.ts) + the DB-driven extras from get_model_client
// (deepseek, opencode-zen, custom). `gatewayPrefix` (Dyad Pro routing) is
// dropped; the `auto` entry no longer points at a subscription page.

export const OPENCODE_ZEN_API_BASE_URL = "https://opencode.ai/zen/v1";

export interface ProviderDef {
  id: string;
  displayName: string;
  /** Env var holding the key (settings key wins over env). Absent = keyless. */
  envVarName?: string;
  /** Direct base URL for the provider API. */
  baseUrl?: string;
  /** True for on-device runtimes (never need a key). */
  local?: boolean;
  /** True when the key buys a free tier at the provider. */
  hasFreeTier?: boolean;
  websiteUrl?: string;
  /** Secondary providers hide behind "show more" in settings. */
  secondary?: boolean;
  /** Fetch-streaming transport state (see routing.ts). */
  transport: "streamable" | "needs-work";
  transportNote?: string;
}

export const PROVIDER_TO_ENV_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  azure: "AZURE_API_KEY",
  xai: "XAI_API_KEY",
  bedrock: "AWS_BEARER_TOKEN_BEDROCK",
  minimax: "MINIMAX_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  "opencode-zen": "OPENCODE_ZEN_API_KEY",
  opencodeZen: "OPENCODE_ZEN_API_KEY",
  opencodeGo: "OPENCODE_GO_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  together: "TOGETHER_API_KEY",
  cohere: "COHERE_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
};

export const PROVIDERS: Record<string, ProviderDef> = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    envVarName: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    websiteUrl: "https://platform.openai.com/api-keys",
    transport: "streamable",
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    envVarName: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    websiteUrl: "https://console.anthropic.com/settings/keys",
    transport: "streamable",
  },
  google: {
    id: "google",
    displayName: "Google",
    envVarName: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    hasFreeTier: true,
    websiteUrl: "https://aistudio.google.com/api-keys",
    transport: "streamable",
  },
  vertex: {
    id: "vertex",
    displayName: "Google Vertex AI",
    websiteUrl: "https://console.cloud.google.com/vertex-ai",
    secondary: true,
    transport: "needs-work",
    transportNote:
      "Service-account OAuth is not wired to fetch streaming yet — point a custom provider at a Vertex OpenAI-compatible gateway, or use google provider instead.",
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    envVarName: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    hasFreeTier: true,
    websiteUrl: "https://openrouter.ai/settings/keys",
    transport: "streamable",
  },
  auto: {
    id: "auto",
    displayName: "Auto",
    transport: "streamable",
    transportNote:
      "Resolves to the first provider with a configured key — no account or payment needed.",
  },
  azure: {
    id: "azure",
    displayName: "Azure OpenAI",
    envVarName: "AZURE_API_KEY",
    websiteUrl: "https://portal.azure.com/",
    secondary: true,
    transport: "streamable",
  },
  xai: {
    id: "xai",
    displayName: "xAI",
    envVarName: "XAI_API_KEY",
    baseUrl: "https://api.x.ai/v1",
    websiteUrl: "https://console.x.ai/",
    secondary: true,
    transport: "streamable",
  },
  bedrock: {
    id: "bedrock",
    displayName: "AWS Bedrock",
    envVarName: "AWS_BEARER_TOKEN_BEDROCK",
    websiteUrl: "https://console.aws.amazon.com/bedrock/",
    secondary: true,
    transport: "needs-work",
    transportNote:
      "SigV4 request signing is not wired to fetch streaming yet — point a custom provider at a Bedrock OpenAI-compatible proxy, or use anthropic provider directly.",
  },
  minimax: {
    id: "minimax",
    displayName: "MiniMax",
    envVarName: "MINIMAX_API_KEY",
    baseUrl: "https://api.minimax.io/v1",
    websiteUrl: "https://platform.minimax.io/",
    secondary: true,
    transport: "streamable",
  },
  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    envVarName: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    websiteUrl: "https://platform.deepseek.com/api_keys",
    secondary: true,
    transport: "streamable",
  },
  "opencode-zen": {
    id: "opencode-zen",
    displayName: "OpenCode Zen",
    envVarName: "OPENCODE_ZEN_API_KEY",
    baseUrl: OPENCODE_ZEN_API_BASE_URL,
    websiteUrl: "https://opencode.ai/zen",
    secondary: true,
    transport: "streamable",
  },
  opencodeZen: {
    id: "opencodeZen",
    displayName: "OpenCode Zen",
    envVarName: "OPENCODE_ZEN_API_KEY",
    baseUrl: OPENCODE_ZEN_API_BASE_URL,
    websiteUrl: "https://opencode.ai/zen",
    secondary: true,
    transport: "streamable",
  },
  opencodeGo: {
    id: "opencodeGo",
    displayName: "OpenCode Go",
    envVarName: "OPENCODE_GO_API_KEY",
    baseUrl: "https://opencode.ai/zen/go/v1",
    websiteUrl: "https://opencode.ai/zen",
    secondary: true,
    transport: "streamable",
  },
  groq: {
    id: "groq",
    displayName: "Groq",
    envVarName: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    websiteUrl: "https://console.groq.com/keys",
    secondary: true,
    transport: "streamable",
  },
  mistral: {
    id: "mistral",
    displayName: "Mistral",
    envVarName: "MISTRAL_API_KEY",
    baseUrl: "https://api.mistral.ai/v1",
    websiteUrl: "https://console.mistral.ai/api-keys",
    secondary: true,
    transport: "streamable",
  },
  together: {
    id: "together",
    displayName: "Together AI",
    envVarName: "TOGETHER_API_KEY",
    baseUrl: "https://api.together.xyz/v1",
    websiteUrl: "https://api.together.xyz/settings/api-keys",
    secondary: true,
    transport: "streamable",
  },
  cohere: {
    id: "cohere",
    displayName: "Cohere",
    envVarName: "COHERE_API_KEY",
    baseUrl: "https://api.cohere.com/v2",
    websiteUrl: "https://dashboard.cohere.com/api-keys",
    secondary: true,
    transport: "streamable",
  },
  fireworks: {
    id: "fireworks",
    displayName: "Fireworks AI",
    envVarName: "FIREWORKS_API_KEY",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    websiteUrl: "https://fireworks.ai/account/api-keys",
    secondary: true,
    transport: "streamable",
  },
  ollama: {
    id: "ollama",
    displayName: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    local: true,
    hasFreeTier: true,
    transport: "streamable",
  },
  lmstudio: {
    id: "lmstudio",
    displayName: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    local: true,
    hasFreeTier: true,
    transport: "streamable",
  },
  custom: {
    id: "custom",
    displayName: "Custom (OpenAI-compatible)",
    transport: "streamable",
    transportNote: "Requires an API Base URL in settings.",
  },
};

/** Providers needing no key and no account: local runtimes only. */
export function keylessProviders(): ProviderDef[] {
  return Object.values(PROVIDERS).filter((p) => p.local === true);
}
