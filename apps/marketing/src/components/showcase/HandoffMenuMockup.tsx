"use client";

import { useState } from "react";
import { ArrowLeftRight, Check } from "lucide-react";
import {
  ClaudeIcon,
  DeepSeekIcon,
  GeminiIcon,
  OllamaIcon,
  OpenAIIcon,
  OpencodeIcon,
} from "@/components/BrandIcons";

interface ProviderOption {
  id: string;
  name: string;
  model: string;
  icon: any;
  color: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "claude",
    name: "Handoff to Claude",
    model: "Claude 3.7 Sonnet",
    icon: ClaudeIcon,
    color: "text-[#D97757]",
  },
  {
    id: "cursor",
    name: "Handoff to OpenAI",
    model: "GPT-4o & o3-mini",
    icon: OpenAIIcon,
    color: "text-emerald-400",
  },
  {
    id: "gemini",
    name: "Handoff to Gemini",
    model: "Gemini 2.5 Flash",
    icon: GeminiIcon,
    color: "text-amber-400",
  },
  {
    id: "deepseek",
    name: "Handoff to DeepSeek",
    model: "DeepSeek R1 Reasoning",
    icon: DeepSeekIcon,
    color: "text-blue-400",
  },
  {
    id: "opencode",
    name: "Handoff to OpenCode",
    model: "Zen Open Weights",
    icon: OpencodeIcon,
    color: "text-cyan-400",
  },
  {
    id: "ollama",
    name: "Handoff to Local Ollama",
    model: "Offline Llama 3.3",
    icon: OllamaIcon,
    color: "text-stone-300",
  },
];

export function HandoffMenuMockup() {
  const [selectedId, setSelectedId] = useState<string>("claude");

  return (
    <div className="flex w-full max-w-[310px] flex-col items-end gap-2">
      {/* Top Hand off pill button matching Caide app header */}
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#1e2024]/90 px-3 py-1.5 text-[12px] font-medium text-stone-200 shadow-md backdrop-blur-md">
        <ArrowLeftRight className="size-3.5 text-stone-400" />
        <span>Hand off</span>
      </div>

      {/* Floating Provider Dropdown Menu */}
      <div className="w-full rounded-xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <div className="flex flex-col gap-0.5">
          {PROVIDERS.map((provider) => {
            const isSelected = selectedId === provider.id;
            const Icon = provider.icon;
            return (
              <button
                key={provider.id}
                onClick={() => setSelectedId(provider.id)}
                className={`group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-all ${
                  isSelected
                    ? "bg-white/[0.08] text-white ring-1 ring-white/15"
                    : "text-stone-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`size-4 shrink-0 ${provider.color}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate text-[13px] font-medium tracking-tight">
                    {provider.name}
                  </span>
                </div>
                {isSelected && <Check className="size-3.5 shrink-0 text-[var(--accent-link)]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
