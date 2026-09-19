"use client";

import { useState } from "react";
import { Globe, Smartphone, Package, Check } from "lucide-react";

const TARGETS = [
  { id: "vercel", label: "Vercel Deploy", detail: "caide-calc.vercel.app", Icon: Globe },
  { id: "apk", label: "Android APK", detail: "18.4 MB native build", Icon: Smartphone },
  { id: "pkg", label: "CAIDEPKG Archive", detail: "portable bundle", Icon: Package },
];

export function PublishDeployMockup() {
  const [selected, setSelected] = useState("vercel");

  return (
    <div className="w-full max-w-[320px] rounded-xl border border-white/10 bg-[#131417] p-3 shadow-2xl">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <span className="text-[12px] font-medium text-stone-200">Publish & Deploy</span>
        <span className="font-mono text-[10px] text-emerald-400">ready</span>
      </div>

      <div className="mt-2.5 space-y-1">
        {TARGETS.map((target) => {
          const isSelected = selected === target.id;
          const TargetIcon = target.Icon;
          return (
            <button
              key={target.id}
              type="button"
              onClick={() => setSelected(target.id)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
                isSelected
                  ? "bg-white/10 text-white font-medium"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <TargetIcon className="size-3.5 text-stone-400 shrink-0" />
                <span className="truncate">{target.label}</span>
              </div>
              <span className="font-mono text-[10.5px] text-stone-400 shrink-0">
                {target.detail}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          type="button"
          className="w-full rounded-lg bg-white/10 py-1.5 text-[12px] font-medium text-stone-200 hover:bg-white/15 transition-colors"
        >
          Deploy to Production
        </button>
      </div>
    </div>
  );
}
