"use client";

import { useState } from "react";
import { GitCommit, GitPullRequest, ArrowUpRight, GitBranch, Check, Plus } from "lucide-react";

interface GitAction {
  id: string;
  label: string;
  sub: string;
  icon: any;
  badge?: string;
  badgeColor?: string;
}

const ACTIONS: GitAction[] = [
  {
    id: "commit",
    label: "Commit 4 modified files",
    sub: "+142 lines, -18 lines",
    icon: GitCommit,
    badge: "+142 -18",
    badgeColor: "text-emerald-400 bg-emerald-500/10",
  },
  {
    id: "push",
    label: "Push to origin/main",
    sub: "feature/native-calculator",
    icon: ArrowUpRight,
  },
  {
    id: "pr",
    label: "Open Pull Request #24",
    sub: "Ready for review",
    icon: GitPullRequest,
    badge: "PR #24",
    badgeColor: "text-purple-400 bg-purple-500/10",
  },
  {
    id: "branch",
    label: "Create isolated worktree",
    sub: "New branch with clean workdir",
    icon: Plus,
  },
];

export function GitActionsMockup() {
  const [selectedId, setSelectedId] = useState<string>("commit");

  return (
    <div className="w-full max-w-[340px] rounded-2xl border border-white/10 bg-[#141518]/95 p-2 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="mb-1.5 flex items-center justify-between px-2 pt-1 pb-0.5">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-stone-400">
          <GitBranch className="size-3 text-[var(--accent-link)]" />
          <span>Git Operations</span>
        </div>
        <span className="font-mono text-[10.5px] text-stone-400">feat/calculator</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {ACTIONS.map((action) => {
          const isSelected = selectedId === action.id;
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => setSelectedId(action.id)}
              className={`group flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-all ${
                isSelected
                  ? "bg-white/[0.08] text-white ring-1 ring-white/15"
                  : "text-stone-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/5 text-stone-300 group-hover:text-white">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium tracking-tight">{action.label}</p>
                  <p className="truncate text-[11px] text-stone-400">{action.sub}</p>
                </div>
              </div>

              {action.badge && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${action.badgeColor}`}
                >
                  {action.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
