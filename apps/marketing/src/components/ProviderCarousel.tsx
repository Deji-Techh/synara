"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClaudeIcon,
  OpenAIIcon,
  DeepSeekIcon,
  GeminiIcon,
  GroqIcon,
  OllamaIcon,
  OpencodeIcon,
} from "@/components/BrandIcons";
import { FiChevronLeft, FiChevronRight, FiKey, FiCheckCircle, FiCpu, FiShield } from "react-icons/fi";
import { AppWindow } from "lucide-react";

interface ProviderItem {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  category: string;
  iconColor: string;
  iconBg: string;
  accentBorder: string;
  Icon: typeof ClaudeIcon;
  models: {
    name: string;
    description: string;
    badge?: string;
  }[];
  bestFor: string;
  contextWindow: string;
  latency: string;
  privacyNote: string;
  keyPrefix: string;
}

const PROVIDERS: ProviderItem[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    shortName: "Claude",
    tagline: "Frontier reasoning & deep architectural turn execution",
    category: "Thinking & Code Synthesis",
    iconColor: "text-[#D97757]",
    iconBg: "bg-[#D97757]/10",
    accentBorder: "border-[#D97757]/30",
    Icon: ClaudeIcon,
    models: [
      { name: "Claude 3.7 Sonnet", description: "Hybrid thinking mode up to 64k tokens", badge: "Extended Thinking" },
      { name: "Claude 3.5 Sonnet", description: "Benchmark standard for UI generation", badge: "Fast & Accurate" },
      { name: "Claude 3.5 Haiku", description: "Sub-second diff verification & linting", badge: "Ultra Fast" },
    ],
    bestFor: "Complex multi-file refactoring & architecture",
    contextWindow: "200k tokens",
    latency: "Streaming (~85 tok/s)",
    privacyNote: "Direct keys stored in OS SafeStorage",
    keyPrefix: "sk-ant-api03-",
  },
  {
    id: "openai",
    name: "OpenAI",
    shortName: "OpenAI",
    tagline: "Precise contract adherence, JSON tool schemas & reasoning",
    category: "Contract & Logic Precision",
    iconColor: "text-[#10A37F]",
    iconBg: "bg-[#10A37F]/10",
    accentBorder: "border-[#10A37F]/30",
    Icon: OpenAIIcon,
    models: [
      { name: "o3-mini", description: "High-reasoning code & mathematics specialist", badge: "Reasoning Low/Med/High" },
      { name: "o1", description: "Full-depth chain of thought code audit", badge: "Deep Audit" },
      { name: "GPT-4o", description: "Reliable multimodal UI analysis & generation", badge: "Multimodal" },
    ],
    bestFor: "Strict JSON contracts & deep test debugging",
    contextWindow: "128k - 200k tokens",
    latency: "Direct HTTP streaming",
    privacyNote: "Zero proxy gateway or token surcharge",
    keyPrefix: "sk-proj-",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    tagline: "Unmatched performance-to-cost ratio with open weights",
    category: "Cost Efficiency & Open Weights",
    iconColor: "text-[#4D6BFE]",
    iconBg: "bg-[#4D6BFE]/10",
    accentBorder: "border-[#4D6BFE]/30",
    Icon: DeepSeekIcon,
    models: [
      { name: "DeepSeek-R1", description: "Full reasoning trace with open-weights parity", badge: "Full CoT" },
      { name: "DeepSeek-V3", description: "Fast general-purpose coding assistant", badge: "MoE 671B" },
    ],
    bestFor: "High-volume generation & transparent reasoning",
    contextWindow: "64k tokens",
    latency: "Fast concurrent streaming",
    privacyNote: "Direct API or local quantized inference",
    keyPrefix: "sk-",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    shortName: "Gemini",
    tagline: "Massive context memory for analyzing entire repositories",
    category: "2M+ Infinite Context",
    iconColor: "text-[#1BA1E3]",
    iconBg: "bg-[#1BA1E3]/10",
    accentBorder: "border-[#1BA1E3]/30",
    Icon: GeminiIcon,
    models: [
      { name: "Gemini 2.5 Pro", description: "2 Million token context for whole-repo analysis", badge: "2M Context" },
      { name: "Gemini 2.5 Flash", description: "Instantaneous responses for conversational planning", badge: "Sub-Second" },
    ],
    bestFor: "Entire codebase ingestion & large log inspection",
    contextWindow: "2,000,000+ tokens",
    latency: "Google DeepMind infrastructure",
    privacyNote: "Stored locally in Caide keychain",
    keyPrefix: "AIzaSy",
  },
  {
    id: "groq",
    name: "Groq (LPU Inference)",
    shortName: "Groq",
    tagline: "Unreal 500+ tokens per second on LPUs for instant turns",
    category: "Extreme Speed (500+ tok/s)",
    iconColor: "text-[#F54F35]",
    iconBg: "bg-[#F54F35]/10",
    accentBorder: "border-[#F54F35]/30",
    Icon: GroqIcon,
    models: [
      { name: "Llama 3.3 70B Versatile", description: "Instantaneous turn streaming & planning", badge: "500+ Tok/s" },
      { name: "DeepSeek-R1 Distill 70B", description: "Real-time reasoning at LPU speeds", badge: "Rapid CoT" },
    ],
    bestFor: "Interactive rapid iteration & zero-latency feedback",
    contextWindow: "128k tokens",
    latency: "500+ tokens/sec (Hardware LPU)",
    privacyNote: "Direct BYOK connection to Groq Cloud",
    keyPrefix: "gsk_",
  },
  {
    id: "ollama",
    name: "Ollama (Local Offline)",
    shortName: "Ollama",
    tagline: "100% private, zero-cost, air-gapped local GPU inference",
    category: "100% Offline & Private",
    iconColor: "text-[var(--text-primary)]",
    iconBg: "bg-black/5 dark:bg-white/10",
    accentBorder: "border-black/10 dark:border-white/20",
    Icon: OllamaIcon,
    models: [
      { name: "Qwen 2.5 Coder 32B", description: "Top-tier open coder running on Apple Silicon / RTX", badge: "Local GPU" },
      { name: "DeepSeek-R1 14B / 32B", description: "Local reasoning model with complete privacy", badge: "Air-Gapped" },
      { name: "Llama 3.3 8B / 70B", description: "Lightweight and versatile local assistant", badge: "Zero Cost" },
    ],
    bestFor: "Proprietary code, zero internet & zero token bills",
    contextWindow: "Dynamic based on VRAM",
    latency: "Local GPU (Apple Metal / NVIDIA CUDA)",
    privacyNote: "Zero bytes leave your computer",
    keyPrefix: "http://localhost:11434",
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    shortName: "Custom",
    tagline: "Connect vLLM, LM Studio, Together, OpenRouter, or LiteLLM",
    category: "Self-Hosted & Enterprise",
    iconColor: "text-[#EC4899]",
    iconBg: "bg-[#EC4899]/10",
    accentBorder: "border-[#EC4899]/30",
    Icon: OpencodeIcon,
    models: [
      { name: "vLLM / TGI Endpoints", description: "Enterprise cluster deployments", badge: "Self-Hosted" },
      { name: "OpenRouter & Together", description: "Any router or open marketplace endpoint", badge: "Aggregator" },
    ],
    bestFor: "Enterprise VPCs, custom fine-tunes & internal proxies",
    contextWindow: "Custom endpoint defined",
    latency: "Your server latency",
    privacyNote: "Direct point-to-point connection",
    keyPrefix: "https://your-custom-ai.internal/v1",
  },
];

export function ProviderCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % PROVIDERS.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + PROVIDERS.length) % PROVIDERS.length);
  }, []);

  // Auto-advance every 5 seconds unless hovered
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const active = PROVIDERS[currentIndex] ?? PROVIDERS[0]!;
  const ActiveIcon = active.Icon;

  return (
    <div
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)] transition-all"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Top macOS-style Window Header */}
      <div className="relative z-10 flex h-10 shrink-0 items-center justify-between border-b border-[var(--divide)] bg-[var(--mock-row)]/90 px-4 backdrop-blur-md">
        {/* Window Traffic Lights */}
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f56] ring-1 ring-[#e0443e]/40" />
          <span className="size-2.5 rounded-full bg-[#ffbd2e] ring-1 ring-[#dea123]/40" />
          <span className="size-2.5 rounded-full bg-[#27c93f] ring-1 ring-[#1aab29]/40" />
        </div>

        {/* Center Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] px-3 py-0.5 font-mono text-[10.5px] font-medium text-[var(--text-secondary)]">
          <AppWindow className="size-3 text-[var(--text-tertiary)]" />
          <span>caide — provider-hub</span>
        </div>

        {/* Right Status Indicator */}
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium hidden sm:inline">
            Direct BYOK
          </span>
        </div>
      </div>

      {/* Main Slide Card Area */}
      <div className="p-4 sm:p-6 flex flex-col justify-between min-h-[350px]">
        {/* Provider Brand Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-11 items-center justify-center rounded-xl ${active.iconBg} ${active.iconColor} ring-1 ring-black/5 dark:ring-white/10 shadow-sm`}
              >
                <ActiveIcon className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                    {active.name}
                  </h4>
                  <span className="rounded-full border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    {active.category}
                  </span>
                </div>
                <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">
                  {active.tagline}
                </p>
              </div>
            </div>

            {/* Prev / Next Chevrons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous provider"
                className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--divide)] bg-[var(--card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <FiChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next provider"
                className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--divide)] bg-[var(--card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <FiChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Model Roster */}
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
              <FiCpu className="size-3" />
              <span>Available Models in Turn Loop</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {active.models.map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] px-3 py-2 text-left"
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">
                      {model.name}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                      {model.description}
                    </div>
                  </div>
                  {model.badge && (
                    <span className="shrink-0 rounded-md bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-link)] border border-[var(--divide)]">
                      {model.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Key Capabilities Matrix */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--divide)] bg-[var(--mock-row)]/50 p-2.5 text-center">
            <div>
              <div className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)]">
                Context
              </div>
              <div className="mt-0.5 text-[12px] font-medium text-[var(--text-primary)] truncate">
                {active.contextWindow}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)]">
                Speed
              </div>
              <div className="mt-0.5 text-[12px] font-medium text-[var(--text-primary)] truncate">
                {active.latency}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)]">
                Best For
              </div>
              <div className="mt-0.5 text-[12px] font-medium text-[var(--text-primary)] truncate">
                {active.bestFor}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Key Storage Bar */}
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 flex items-center justify-between text-[11.5px]">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono">
            <FiKey className="size-3.5" />
            <span className="truncate max-w-[200px] sm:max-w-none">
              {active.keyPrefix}••••••••••••••••
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <FiShield className="size-3 text-emerald-500" />
            <span className="hidden sm:inline">Zero Gateway Markup</span>
            <FiCheckCircle className="size-3.5 text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Quick Navigation Tabs Bar */}
      <div className="flex items-center justify-between border-t border-[var(--divide)] bg-[var(--mock-row)] px-3 py-2 overflow-x-auto no-scrollbar gap-1">
        {PROVIDERS.map((p, idx) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setCurrentIndex(idx)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
              idx === currentIndex
                ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm border border-[var(--divide)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--card)]/50"
            }`}
          >
            <p.Icon className="size-3" />
            <span>{p.shortName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
