"use client";

import { NeonIcon, SupabaseIcon } from "@/components/BrandIcons";
import { FiGitBranch, FiCheck, FiPlay, FiDatabase, FiRefreshCw } from "react-icons/fi";
import { AppWindow, Table, ShieldCheck, Zap } from "lucide-react";

export function DatabaseBranchingMockup() {
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
          <span>caide — neon-database-branch</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
          <NeonIcon className="size-3" />
          <span>Copy-on-Write (1.2s)</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {/* Branch Status Card */}
        <div className="flex items-center justify-between rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <FiGitBranch className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  feat-calc-history
                </span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-700 dark:text-cyan-300">
                  Isolated Branch
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                Branched from: <span className="font-mono text-[var(--text-secondary)]">main (prod-replica)</span> • Zero cost storage
              </div>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--divide)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-xs hover:bg-[var(--mock-row)]"
          >
            1-Click Restore
          </button>
        </div>

        {/* Live SQL Migration Preview */}
        <div className="rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5 font-mono">
              <Table className="size-3.5 text-sky-500" />
              <span>migrations/001_create_calculations.sql</span>
            </div>
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <FiCheck className="size-3" /> Dry Run Passed
            </span>
          </div>

          <div className="rounded-lg border border-[var(--divide)] bg-[#0d1117] p-2.5 font-mono text-[11px] text-slate-200 overflow-x-auto">
            <div className="text-purple-400">CREATE TABLE <span className="text-sky-300">calculations</span> (</div>
            <div className="pl-3 text-slate-300">id <span className="text-amber-300">UUID PRIMARY KEY</span> <span className="text-blue-400">DEFAULT</span> gen_random_uuid(),</div>
            <div className="pl-3 text-slate-300">expression <span className="text-amber-300">TEXT NOT NULL</span>,</div>
            <div className="pl-3 text-slate-300">result <span className="text-amber-300">NUMERIC(18, 4) NOT NULL</span>,</div>
            <div className="pl-3 text-slate-300">created_at <span className="text-amber-300">TIMESTAMPTZ</span> <span className="text-blue-400">DEFAULT</span> clock_timestamp()</div>
            <div className="text-purple-400">);</div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            <span>Agent never writes directly to production DB</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] shadow-xs"
            >
              <span>Query Console</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--btn-primary-bg)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--btn-primary-fg)] shadow-xs"
            >
              <span>Apply to Branch</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
