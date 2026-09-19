"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";

export function ToolConsentMockup() {
  const [allowed, setAllowed] = useState(false);

  return (
    <div className="w-full max-w-[320px] rounded-xl border border-white/10 bg-[#131417] p-3 shadow-2xl">
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <Terminal className="size-3.5 text-stone-400" />
        <span className="text-[12px] font-medium text-stone-200">Terminal Approval</span>
      </div>

      <div className="mt-2.5 rounded-lg bg-black/50 p-2 font-mono text-[11px] text-stone-300 border border-white/5">
        <p className="text-stone-400 text-[10px] pb-1">~/Developer/caide-mobile-app</p>
        <p className="text-white">$ bun add react-native-reanimated</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAllowed(!allowed)}
          className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${
            allowed ? "bg-white/20 text-white" : "bg-white/10 text-stone-200 hover:bg-white/15"
          }`}
        >
          {allowed ? "Allowed" : "Allow"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/5 px-3 py-1.5 text-[12px] text-stone-400 hover:text-stone-200"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
