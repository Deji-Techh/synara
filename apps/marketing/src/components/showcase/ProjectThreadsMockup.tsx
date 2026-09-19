"use client";

import { ExpoIcon, FlutterIcon, NextjsIcon, NeonIcon } from "@/components/BrandIcons";
import { FiFolder, FiGitBranch, FiMessageSquare, FiPlus, FiSearch, FiCheck, FiClock } from "react-icons/fi";
import { AppWindow, Database, Sparkles } from "lucide-react";

export function ProjectThreadsMockup() {
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
          <span>caide — workspace-isolation</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>3 Projects Active</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {/* Quick Search & Actions */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--divide)] pb-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] bg-[var(--block-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--divide)] flex-1 max-w-[240px]">
            <FiSearch className="size-3.5" />
            <span>Search threads & branches...</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--divide)] bg-[var(--card)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-xs">
              <FiGitBranch className="size-3 text-[var(--accent-link)]" />
              <span>neon-sync</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--btn-primary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--btn-primary-fg)] shadow-xs"
            >
              <FiPlus className="size-3" />
              <span>New Thread</span>
            </button>
          </div>
        </div>

        {/* Project 1: React Native Expo (Active) */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-white dark:bg-black/40 shadow-xs border border-black/5 dark:border-white/10">
                <ExpoIcon className="size-3.5" />
              </div>
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                calculator-mobile-app
              </span>
              <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                Expo SDK 52
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
              <NeonIcon className="size-3" />
              <span>branch: feat-haptics</span>
            </div>
          </div>

          {/* Threads List */}
          <div className="pl-3 border-l-2 border-sky-500/40 space-y-1.5 mt-2">
            <div className="flex items-center justify-between rounded-lg bg-[var(--card)] px-2.5 py-1.5 border border-[var(--divide)] shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                  Implement dark calculator keypad & haptics
                </span>
              </div>
              <span className="shrink-0 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                turn #4 active
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--mock-row)] transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <FiCheck className="size-3 text-slate-400 shrink-0" />
                <span className="truncate text-[11.5px]">
                  AsyncStorage session history state
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-tertiary)]">22m ago</span>
            </div>
          </div>
        </div>

        {/* Project 2: Flutter */}
        <div className="rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-white dark:bg-black/40 shadow-xs border border-black/5 dark:border-white/10">
              <FlutterIcon className="size-3.5" />
            </div>
            <div>
              <span className="text-[12.5px] font-medium text-[var(--text-primary)]">
                crypto-portfolio-client
              </span>
              <div className="text-[10.5px] text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
                <FiClock className="size-2.5" />
                <span>Thread: WebSocket orderbook stream • 2h ago</span>
              </div>
            </div>
          </div>
          <span className="rounded-full border border-[var(--divide)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] font-mono">
            APK Ready
          </span>
        </div>

        {/* Project 3: Next.js Website */}
        <div className="rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-white dark:bg-black/40 shadow-xs border border-black/5 dark:border-white/10">
              <NextjsIcon className="size-3.5" />
            </div>
            <div>
              <span className="text-[12.5px] font-medium text-[var(--text-primary)]">
                caide-marketing-portal
              </span>
              <div className="text-[10.5px] text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
                <Database className="size-2.5 text-cyan-500" />
                <span>Neon Postgres Sync: prod-replica</span>
              </div>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
            Vercel Synced
          </span>
        </div>
      </div>
    </div>
  );
}
