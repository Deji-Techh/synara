"use client";

import { useState } from "react";
import { Compass } from "lucide-react";

export function BlueprintSurveyMockup() {
  const [selected, setSelected] = useState(0);

  return (
    <div className="w-full max-w-[320px] rounded-xl border border-white/10 bg-[#131417] p-3 shadow-2xl">
      <div className="flex items-center gap-1.5 pb-2 border-b border-white/5">
        <Compass className="size-3.5 text-stone-400" />
        <span className="text-[12px] font-medium text-stone-200">App Blueprint Survey</span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <p className="text-[11.5px] text-stone-400">Select layout strategy:</p>
        {["Adaptive 2-column layout", "Single column with slide drawer"].map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
              selected === i
                ? "bg-white/10 text-white font-medium"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <span
              className={`size-3 rounded-full border flex items-center justify-center shrink-0 ${
                selected === i ? "border-white bg-white" : "border-stone-500"
              }`}
            >
              {selected === i && <span className="size-1 rounded-full bg-black" />}
            </span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
