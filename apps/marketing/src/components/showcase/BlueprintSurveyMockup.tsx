"use client";

import { ClaudeIcon } from "@/components/BrandIcons";
import { FiCheck, FiCheckSquare, FiLayers, FiFileText, FiArrowRight } from "react-icons/fi";
import { AppWindow, HelpCircle, ShieldCheck } from "lucide-react";

export function BlueprintSurveyMockup() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)]">
      {/* Window Chrome Header */}
      <div className="flex h-10 items-center justify-between border-b border-[var(--divide)] bg-[var(--mock-row)]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f56] ring-1 ring-[#e0443e]/40" />
          <span className="size-2.5 rounded-full bg-[#ffbd2e] ring-1 ring-[#dea123]/40" />
          <span className="size-2.5 rounded-full bg-[#27c93f] ring-1 ring-[#1aab29]/40" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] px-3 py-0.5 font-mono text-[10.5px] font-medium text-[var(--text-secondary)]">
          <AppWindow className="size-3 text-[var(--text-tertiary)]" />
          <span>caide — architecture-blueprint</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-sky-600 dark:text-sky-400">
          <ClaudeIcon className="size-3 text-[#D97757]" />
          <span>Claude 3.7 Thinking</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Assistant Turn Message */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.02] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-sky-500 animate-pulse" />
              <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                App Blueprint: Dual-Display Calculator
              </span>
            </div>
            <span className="rounded-md border border-[var(--divide)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
              Phase 1 / Scaffolding
            </span>
          </div>

          {/* Module Specs Tree */}
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg border border-[var(--divide)] bg-[var(--block-elevated)] p-2">
              <div className="font-mono text-sky-600 dark:text-sky-400 font-semibold truncate">
                screens/Calc.tsx
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                Dual display + memory
              </div>
            </div>
            <div className="rounded-lg border border-[var(--divide)] bg-[var(--block-elevated)] p-2">
              <div className="font-mono text-sky-600 dark:text-sky-400 font-semibold truncate">
                components/Keypad.tsx
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                4x4 grid + haptics
              </div>
            </div>
            <div className="rounded-lg border border-[var(--divide)] bg-[var(--block-elevated)] p-2">
              <div className="font-mono text-sky-600 dark:text-sky-400 font-semibold truncate">
                hooks/useCalculator.ts
              </div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                State machine logic
              </div>
            </div>
          </div>
        </div>

        {/* 3-Question Architecture Survey Card */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="size-4 text-amber-500" />
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                Technical Tradeoff Survey (3 Questions)
              </span>
            </div>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Required before write
            </span>
          </div>

          <div className="space-y-2 text-[11.5px]">
            <div className="flex items-center justify-between rounded-lg border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5">
              <span className="text-[var(--text-secondary)]">1. Keypad layout</span>
              <span className="font-medium text-amber-600 dark:text-amber-400 font-mono text-[11px] flex items-center gap-1">
                <FiCheck className="size-3" /> Standard 4x4 Grid
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5">
              <span className="text-[var(--text-secondary)]">2. Session history</span>
              <span className="font-medium text-amber-600 dark:text-amber-400 font-mono text-[11px] flex items-center gap-1">
                <FiCheck className="size-3" /> AsyncStorage Local Cache
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5">
              <span className="text-[var(--text-secondary)]">3. Haptic feedback</span>
              <span className="font-medium text-amber-600 dark:text-amber-400 font-mono text-[11px] flex items-center gap-1">
                <FiCheck className="size-3" /> Expo Heavy Impact
              </span>
            </div>
          </div>
        </div>

        {/* Action Gate Button */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            <span>Zero files modified until approved</span>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-3.5 py-2 text-[12px] font-medium text-[var(--btn-primary-fg)] shadow-sm"
          >
            <span>Approve Blueprint & Run</span>
            <FiArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
