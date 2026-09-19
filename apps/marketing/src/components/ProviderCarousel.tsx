"use client";

import { useState } from "react";
import { ClaudeIcon, OpenAIIcon, DeepSeekIcon, OllamaIcon } from "@/components/BrandIcons";
import { Shield, Zap, Key, CheckCircle2 } from "lucide-react";

interface ProviderItem {
  id: string;
  name: string;
  subtitle: string;
  tag: string;
  models: string[];
  accentColor: string;
  accentBg: string;
  borderGlow: string;
  Icon: typeof ClaudeIcon;
  stat: string;
}

const PROVIDERS: ProviderItem[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    subtitle: "Frontier reasoning & deep turn execution",
    tag: "Extended Thinking",
    models: ["Claude 3.7 Sonnet", "Claude 3.5 Sonnet", "Claude 3.5 Haiku"],
    accentColor: "text-[#D97757]",
    accentBg: "bg-[#D97757]/12",
    borderGlow: "border-[#D97757]/40 shadow-[#D97757]/10",
    Icon: ClaudeIcon,
    stat: "Up to 64k thinking tokens",
  },
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "Precise code contracts & structured outputs",
    tag: "High Reasoning",
    models: ["o3-mini (High)", "o1", "GPT-4o"],
    accentColor: "text-[#10A37F]",
    accentBg: "bg-[#10A37F]/12",
    borderGlow: "border-[#10A37F]/40 shadow-[#10A37F]/10",
    Icon: OpenAIIcon,
    stat: "Strict JSON schema adherence",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    subtitle: "Open weights with transparent chain of thought",
    tag: "Open Weights",
    models: ["DeepSeek-R1", "DeepSeek-V3"],
    accentColor: "text-[#4D6BFE]",
    accentBg: "bg-[#4D6BFE]/12",
    borderGlow: "border-[#4D6BFE]/40 shadow-[#4D6BFE]/10",
    Icon: DeepSeekIcon,
    stat: "Full reasoning trace exposed",
  },
  {
    id: "ollama",
    name: "Ollama Local",
    subtitle: "100% private offline GPU inference",
    tag: "100% Offline",
    models: ["Qwen 2.5 Coder 32B", "DeepSeek-R1 14B/32B", "Llama 3.3 70B"],
    accentColor: "text-purple-400",
    accentBg: "bg-purple-500/12",
    borderGlow: "border-purple-500/40 shadow-purple-500/10",
    Icon: OllamaIcon,
    stat: "Zero bytes leave your machine",
  },
];

export function ProviderCarousel() {
  const [selectedId, setSelectedId] = useState("anthropic");
  const selected = PROVIDERS.find((p) => p.id === selectedId) || PROVIDERS[0]!;

  return (
    <div className="w-full space-y-3.5">
      {/* 2x2 Grid of Tactile Provider Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const isSelected = provider.id === selectedId;
          const IconComponent = provider.Icon;

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => setSelectedId(provider.id)}
              className={`group relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? `bg-gradient-to-b from-[#1c1d22] to-[#121316] text-white shadow-xl ${provider.borderGlow} ring-1 ring-white/15`
                  : "bg-white/80 dark:bg-white/[0.03] backdrop-blur-md text-[var(--text-primary)] border border-black/[0.07] dark:border-white/[0.08] shadow-xs hover:border-black/20 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/[0.05]"
              }`}
            >
              {/* Top Header: Brand Squircle + Selection Pill */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex size-9 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                      isSelected
                        ? `${provider.accentBg} ${provider.accentColor} shadow-inner`
                        : "bg-black/[0.04] dark:bg-white/[0.08] text-[var(--text-primary)]"
                    }`}
                  >
                    <IconComponent className="size-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                      isSelected
                        ? "bg-white/10 text-white border border-white/15"
                        : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {provider.tag}
                  </span>
                </div>

                {/* Radio Dot */}
                <div
                  className={`size-3 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-white ring-4 ring-white/20"
                      : "border border-black/20 dark:border-white/20"
                  }`}
                >
                  {isSelected && <div className="size-1 rounded-full bg-black" />}
                </div>
              </div>

              {/* Title & Description */}
              <div className="mt-4">
                <div
                  className={`text-[14.5px] sm:text-[15.5px] font-semibold tracking-tight ${isSelected ? "text-white" : "text-[var(--text-primary)]"}`}
                >
                  {provider.name}
                </div>
                <div
                  className={`mt-1 text-[12px] sm:text-[13px] leading-relaxed ${isSelected ? "text-slate-300" : "text-[var(--text-secondary)]"}`}
                >
                  {provider.subtitle}
                </div>
              </div>

              {/* Model Pills Preview */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {provider.models.map((model, idx) => (
                  <span
                    key={model}
                    className={`rounded-md px-2 py-0.5 text-[10.5px] font-mono transition-colors ${
                      isSelected
                        ? idx === 0
                          ? "bg-white/20 text-white font-medium shadow-xs"
                          : "bg-white/8 text-slate-300"
                        : "bg-black/[0.03] dark:bg-white/[0.05] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {model}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Provider Connection Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] backdrop-blur-md px-4 py-3 text-[12px]">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Key className="size-3.5" />
          </div>
          <span className="text-[var(--text-secondary)] font-medium">
            Active: <strong className="text-[var(--text-primary)]">{selected.name}</strong> •{" "}
            {selected.stat}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
          <CheckCircle2 className="size-3.5" />
          <span>Direct BYOK • Stored in OS Keyring</span>
        </div>
      </div>
    </div>
  );
}
