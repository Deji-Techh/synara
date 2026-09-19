"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  ClaudeIcon,
  OpenAIIcon,
  GeminiIcon,
  DeepSeekIcon,
  OllamaIcon,
  GroqIcon,
} from "@/components/BrandIcons";

const MODELS = [
  { id: "claude", name: "Claude 3.7 Sonnet", Icon: ClaudeIcon },
  { id: "openai", name: "GPT-4o", Icon: OpenAIIcon },
  { id: "gemini", name: "Gemini 2.5 Pro", Icon: GeminiIcon },
  { id: "deepseek", name: "DeepSeek R1", Icon: DeepSeekIcon },
  { id: "ollama", name: "Ollama (Offline)", Icon: OllamaIcon },
  { id: "groq", name: "Llama 3.3 70B", Icon: GroqIcon },
];

export function ModelPickerMockup() {
  const [selected, setSelected] = useState("claude");
  const current = MODELS.find((m) => m.id === selected) || MODELS[0];
  const CurrentIcon = current.Icon;

  return (
    <div className="flex w-full max-w-[270px] flex-col items-center sm:items-end gap-2">
      {/* Plain Trigger Button */}
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#16171a] px-3 py-1.5 text-[12.5px] font-medium text-stone-200 shadow-md transition-colors hover:bg-[#1f2024]"
      >
        <CurrentIcon className="size-3.5 text-stone-300" />
        <span>{current.name}</span>
        <ChevronDown className="size-3 text-stone-400" />
      </button>

      {/* Plain Dropdown Menu */}
      <div className="w-full rounded-xl border border-white/10 bg-[#131417] p-1 shadow-2xl">
        <div className="flex flex-col">
          {MODELS.map((item) => {
            const isSelected = selected === item.id;
            const ItemIcon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                  isSelected
                    ? "bg-white/10 text-white font-medium"
                    : "text-stone-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ItemIcon className="size-3.5 text-stone-400 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
                {isSelected && <Check className="size-3 shrink-0 text-stone-300" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
