"use client";

import { NextjsIcon, NeonIcon } from "@/components/BrandIcons";
import { FiDownload, FiExternalLink, FiGithub, FiCheck, FiPackage, FiGlobe } from "react-icons/fi";
import { Smartphone, AppWindow, CloudCheck } from "lucide-react";

export function PublishDeployMockup() {
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
          <span>caide — publish-center</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>Ready to Ship</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Vercel Live Deployment Card */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-white dark:bg-black/50 border border-black/10 dark:border-white/10 shadow-xs">
                <FiGlobe className="size-3.5 text-slate-800 dark:text-white" />
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                  Vercel Production Deploy
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                  calc-app.vercel.app • Live (Synced with Neon DB)
                </div>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <FiCheck className="size-3" /> 200 OK
            </span>
          </div>
        </div>

        {/* GitHub Repository Sync */}
        <div className="flex items-center justify-between rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-3">
          <div className="flex items-center gap-2.5">
            <FiGithub className="size-4 text-[var(--text-secondary)]" />
            <div>
              <div className="text-[12px] font-medium text-[var(--text-primary)]">
                github.com/Deji-Tech/calc-app
              </div>
              <div className="text-[10.5px] text-[var(--text-tertiary)] font-mono">
                Branch: main (Clean working tree)
              </div>
            </div>
          </div>
          <span className="rounded-lg border border-[var(--divide)] bg-[var(--card)] px-2.5 py-1 text-[10.5px] font-mono text-[var(--text-secondary)]">
            Up to date
          </span>
        </div>

        {/* Native Mobile Build Exports */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1">
            <Smartphone className="size-3" />
            <span>Native Mobile Packages</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-xl border border-[var(--divide)] bg-[var(--card)] p-2.5 shadow-xs">
              <div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">
                  Android APK (Universal)
                </div>
                <div className="text-[10.5px] text-[var(--text-tertiary)] font-mono">
                  Release Build • 48.2 MB
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--btn-primary-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--btn-primary-fg)] shadow-xs"
              >
                <FiDownload className="size-3" />
                <span>Export</span>
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--divide)] bg-[var(--card)] p-2.5 shadow-xs">
              <div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">
                  CAIDEPKG Workspace
                </div>
                <div className="text-[10.5px] text-[var(--text-tertiary)] font-mono">
                  Full Turn & DB Snapshot
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--divide)] bg-[var(--block-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-xs hover:bg-[var(--mock-row)]"
              >
                <FiPackage className="size-3" />
                <span>Bundle</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
