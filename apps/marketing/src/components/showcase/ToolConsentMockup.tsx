"use client";

import { Terminal, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, AppWindow } from "lucide-react";
import { FiCheck, FiX, FiCornerDownRight } from "react-icons/fi";

export function ToolConsentMockup() {
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
          <span>caide — tool-consent-gate</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="size-3" />
          <span>Approval Required</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Pending Command Approval Card */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-[12.5px] text-[var(--text-primary)]">
              <Terminal className="size-4 text-amber-500" />
              <span>Shell Execution Request</span>
            </div>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-mono text-amber-600 dark:text-amber-400 font-medium">
              Waiting for Consent
            </span>
          </div>

          {/* Terminal Command Code Box */}
          <div className="rounded-lg border border-[var(--divide)] bg-[#0d1117] p-2.5 font-mono text-[11.5px] text-slate-200">
            <div className="text-slate-400 text-[10.5px] flex items-center gap-1 mb-1">
              <FiCornerDownRight className="size-3 text-sky-400" />
              <span>apps/calculator-mobile-app $</span>
            </div>
            <div className="text-emerald-400">
              bun add <span className="text-white">expo-haptics @react-native-async-storage/async-storage</span>
            </div>
          </div>

          {/* Safety Audit Checklist */}
          <div className="space-y-1.5 rounded-lg border border-[var(--divide)] bg-[var(--card)] p-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>No destructive filesystem operations (`rm -rf /` blocklist passed)</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>No unverified pipe scripts (`curl | bash` blocklist passed)</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>Scoped to project sandbox: `~/apps/calculator-mobile-app`</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
            <span>Checkpoint #3 armed • 1-click git revert available</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] shadow-xs hover:bg-[var(--mock-row)]"
            >
              <FiX className="size-3.5 text-red-500" />
              <span>Reject</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--btn-primary-bg)] px-3.5 py-1.5 text-[11.5px] font-medium text-[var(--btn-primary-fg)] shadow-xs"
            >
              <FiCheck className="size-3.5 text-emerald-400" />
              <span>Approve Execution</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
