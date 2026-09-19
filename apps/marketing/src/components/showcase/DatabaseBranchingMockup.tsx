"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";

export function DatabaseBranchingMockup() {
  const [active, setActive] = useState(true);

  return (
    <div className="w-full max-w-[320px] rounded-xl border border-white/10 bg-[#131417] p-3 shadow-2xl">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-stone-300">
          <GitBranch className="size-3 text-stone-400" />
          <span>br-calc-v2</span>
        </div>
        <span className="font-mono text-[10px] text-emerald-400">active</span>
      </div>

      <div className="mt-2.5 rounded-lg bg-black/50 p-2 font-mono text-[10.5px] leading-relaxed text-stone-300 border border-white/5">
        <p className="text-stone-400">// 001_create_history.sql</p>
        <p className="text-stone-200">+ CREATE TABLE history (</p>
        <p className="text-stone-200">+ id UUID PRIMARY KEY,</p>
        <p className="text-stone-200">+ expression TEXT</p>
        <p className="text-stone-200">+ );</p>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-stone-400">
        <span>Neon Serverless</span>
        <span>0ms cold start</span>
      </div>
    </div>
  );
}
