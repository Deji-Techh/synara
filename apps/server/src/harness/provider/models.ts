import type { RouterIntent, ModelTier } from "../router/index.ts";

export interface ModelDescriptor {
  id: string;
  name: string;
  endpoint: "responses" | "chat/completions" | "messages" | "gemini";
  contextLimit: number;
  costRank: number; // 1-10
  intelligenceRank: number; // 1-10
  tasteRank: number; // 1-10
}

export const MODEL_CATALOG: Record<string, ModelDescriptor> = {
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    name: "GPT 5.6 Sol",
    endpoint: "responses",
    contextLimit: 200_000,
    costRank: 9, // effectively free
    intelligenceRank: 8,
    tasteRank: 5,
  },
  "sonnet-5": {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    endpoint: "messages",
    contextLimit: 200_000,
    costRank: 5,
    intelligenceRank: 7,
    tasteRank: 8,
  },
  "opus-4.8": {
    id: "claude-3-opus-20240229",
    name: "Claude 3.8 Opus",
    endpoint: "messages",
    contextLimit: 200_000,
    costRank: 4,
    intelligenceRank: 8,
    tasteRank: 9,
  },
  "fable-5": {
    id: "fable-5",
    name: "Fable 5",
    endpoint: "messages",
    contextLimit: 128_000,
    costRank: 2,
    intelligenceRank: 9,
    tasteRank: 9,
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    endpoint: "gemini",
    contextLimit: 1_000_000,
    costRank: 9,
    intelligenceRank: 8,
    tasteRank: 7,
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    endpoint: "gemini",
    contextLimit: 2_000_000,
    costRank: 7,
    intelligenceRank: 9,
    tasteRank: 9,
  },
};

export const MODEL_FALLBACK_CHAINS: Record<string, string[]> = {
  "gpt-5.6-sol": ["gemini-2.5-flash", "sonnet-5"],
  "sonnet-5": ["gemini-2.5-pro", "opus-4.8"],
  "opus-4.8": ["fable-5", "sonnet-5"],
  "fable-5": ["opus-4.8", "gemini-2.5-pro"],
  "gemini-2.5-flash": ["gpt-5.6-sol", "sonnet-5"],
  "gemini-2.5-pro": ["sonnet-5", "opus-4.8"],
};

export function getModelForIntentAndTier(intent: RouterIntent, tier: ModelTier): ModelDescriptor {
  switch (tier) {
    case "cheap":
      return MODEL_CATALOG["gpt-5.6-sol"] ?? MODEL_CATALOG["gemini-2.5-flash"];
    case "medium":
      return MODEL_CATALOG["sonnet-5"] ?? MODEL_CATALOG["gemini-2.5-flash"];
    case "taste":
      return MODEL_CATALOG["opus-4.8"] ?? MODEL_CATALOG["fable-5"] ?? MODEL_CATALOG["gemini-2.5-pro"];
    case "strong":
      return MODEL_CATALOG["gemini-2.5-pro"] ?? MODEL_CATALOG["sonnet-5"] ?? MODEL_CATALOG["gpt-5.6-sol"];
    default:
      return MODEL_CATALOG["gpt-5.6-sol"];
  }
}
