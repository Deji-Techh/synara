"use client";

import { useState } from "react";
import { Globe, Box, GitFork, Search, GitBranch } from "lucide-react";

interface WorktreeItem {
  id: string;
  title: string;
  time: string;
  icon: any;
  active?: boolean;
  branch?: string;
}

const ITEMS: WorktreeItem[] = [
  {
    id: "1",
    title: "Browser sign-in and sh...",
    time: "2d",
    icon: Globe,
  },
  {
    id: "2",
    title: "Browser sign-in and sh...",
    time: "2d",
    icon: Box,
  },
  {
    id: "3",
    title: "Soccer ball physics ...",
    time: "2d",
    icon: GitFork,
    active: true,
    branch: "feat/physics-sim",
  },
  {
    id: "4",
    title: "Editor Search Bar",
    time: "2d",
    icon: Search,
  },
];

export function WorktreesMockup() {
  const [selectedId, setSelectedId] = useState<string>("3");

  return (
    <div className="w-full max-w-[330px] rounded-xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const isSelected = selectedId === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-all ${
                isSelected
                  ? "bg-white/[0.08] text-white shadow-sm ring-1 ring-white/15"
                  : "text-stone-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded ${
                    isSelected ? "text-purple-400" : "text-stone-400 group-hover:text-stone-200"
                  }`}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="truncate text-[13px] font-medium tracking-tight">
                  {item.title}
                </span>
                {isSelected && <GitBranch className="size-3 shrink-0 text-purple-400/80" />}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-stone-400 group-hover:text-stone-300">
                {item.time}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
