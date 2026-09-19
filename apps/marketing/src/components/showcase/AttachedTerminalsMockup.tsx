"use client";

import { useState } from "react";
import { Terminal, Plus, Play, CheckCircle2 } from "lucide-react";

const TABS = [
  { id: "term-1", title: "Terminal 1", tag: "Metro · 8081", active: true },
  { id: "term-2", title: "Terminal 2", tag: "Vite dev" },
  { id: "term-3", title: "Terminal 3", tag: "Vitest" },
];

export function AttachedTerminalsMockup() {
  const [activeTab, setActiveTab] = useState("term-1");

  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-white/10 bg-[#121316]/95 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      {/* Top Tab Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-black/40 px-2.5 pt-1.5 pb-0">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => {
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                  isCurrent
                    ? "bg-[#1e2025] text-white ring-1 ring-white/10 border-b-2 border-sky-400"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                <Terminal className="size-3 text-stone-400" />
                <span>{tab.title}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-stone-400 hover:bg-white/5 hover:text-white"
            aria-label="New Terminal"
          >
            <Plus className="size-3" />
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active Process</span>
        </div>
      </div>

      {/* Terminal Content Body */}
      <div className="flex items-center gap-3.5 p-4 sm:p-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 ring-1 ring-pink-500/30 text-pink-400 shadow-inner">
          <Terminal className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-white">Caide DevServer</span>
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-400">
              v2.1.0
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[11.5px] text-stone-400 truncate">
            Metro Bundler :8081 · Fast Refresh · Claude 3.7
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-stone-400 truncate">
            ~/Developer/caide-mobile-app
          </p>
        </div>
      </div>
    </div>
  );
}
