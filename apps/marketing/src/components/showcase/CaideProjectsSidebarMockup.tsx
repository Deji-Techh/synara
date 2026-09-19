"use client";

import { useState } from "react";
import { Folder, Search, ChevronDown, ChevronRight, Plus } from "lucide-react";

const PROJECTS = [
  {
    name: "Calculator",
    open: true,
    items: [
      { name: "Calculator", time: "3h", active: true },
      { name: "Calculator", time: "4h", active: true },
    ],
  },
  {
    name: "analyse-this-project-suggest",
    open: true,
    items: [{ name: "analyse-this-project-suggest", time: "4h", active: true }],
  },
  {
    name: "vento-",
    open: false,
    items: [],
  },
  {
    name: "rn try 3",
    open: true,
    items: [{ name: "rn try 3", time: "1d", active: true }],
  },
];

export function CaideProjectsSidebarMockup() {
  const [selected, setSelected] = useState("Calculator-0");

  return (
    <div className="w-full max-w-[270px] rounded-xl border border-white/10 bg-[#131417] p-2.5 shadow-2xl">
      {/* Caide Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <span className="font-semibold text-white text-[13px]">Caide</span>
        <Search className="size-3 text-stone-400" />
      </div>

      {/* Projects */}
      <div className="mt-2 space-y-1">
        <p className="px-1 font-mono text-[10px] uppercase tracking-wider text-stone-400">
          Projects
        </p>

        <div className="space-y-0.5 text-[12px]">
          {PROJECTS.map((proj) => (
            <div key={proj.name}>
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-stone-400">
                {proj.open ? (
                  <ChevronDown className="size-3 shrink-0" />
                ) : (
                  <ChevronRight className="size-3 shrink-0" />
                )}
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{proj.name}</span>
              </div>

              {proj.open && proj.items.length > 0 && (
                <div className="ml-4 space-y-0.5 border-l border-white/5 pl-1.5">
                  {proj.items.map((item, idx) => {
                    const key = `${proj.name}-${idx}`;
                    const isSelected = selected === key;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelected(key)}
                        className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[11.5px] transition-colors ${
                          isSelected
                            ? "bg-white/10 text-white"
                            : "text-stone-400 hover:text-stone-200"
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-stone-400">
                          <span>{item.time}</span>
                          {item.active && <span className="size-1 rounded-full bg-rose-500" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
