"use client";

import { useState } from "react";
import { Bot, CheckCircle2, GitBranch, Loader2, Sparkles } from "lucide-react";

export function ConcurrentTasksMockup() {
  const [activeTab, setActiveTab] = useState<"taskA" | "taskB">("taskA");

  return (
    <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#121316]/95 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      {/* Top Header with split tasks */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-black/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("taskA")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              activeTab === "taskA"
                ? "bg-white/10 text-white shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <span className="size-1.5 rounded-full bg-sky-400" />
            <span>Task #1: Native UI</span>
          </button>
          <button
            onClick={() => setActiveTab("taskB")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              activeTab === "taskB"
                ? "bg-white/10 text-white shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <span className="size-1.5 rounded-full bg-purple-400" />
            <span>Task #2: API Routes</span>
          </button>
        </div>

        <span className="font-mono text-[10px] text-stone-400">2 Agents Isolated</span>
      </div>

      {/* Task Content Stream */}
      <div className="p-3.5 space-y-2.5">
        {activeTab === "taskA" ? (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-400">
                <Bot className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-stone-200">
                  Building calculator app — two-tab layout with history
                </p>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-stone-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Contract locked
                  </span>
                  <span>•</span>
                  <span>Explored 5 files</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11.5px]">
              <span className="flex items-center gap-2 font-mono text-sky-300">
                <Loader2 className="size-3 animate-spin text-sky-400" />
                Ran Install package (react-native-reanimated)
              </span>
              <span className="font-mono text-[10.5px] text-stone-400">worktree-1</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
                <GitBranch className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-stone-200">
                  Provisions isolated Neon serverless database branch
                </p>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-stone-400">
                  <span className="flex items-center gap-1 text-purple-400">
                    <CheckCircle2 className="size-3" />
                    Branch br-calc-v2 ready
                  </span>
                  <span>•</span>
                  <span>0ms cold start</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-[11.5px]">
              <span className="font-mono text-purple-300">
                Applied schema migration 001_history.sql
              </span>
              <span className="font-mono text-[10.5px] text-stone-400">worktree-2</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
