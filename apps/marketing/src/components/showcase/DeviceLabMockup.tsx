"use client";

import { QrCode, Smartphone, Wifi, RefreshCw, CheckCircle2, AppWindow } from "lucide-react";
import { FiCopy, FiPlay } from "react-icons/fi";

export function DeviceLabMockup() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)]">
      {/* Window Chrome Header */}
      <div className="flex h-10 items-center justify-between border-b border-[var(--divide)] bg-[var(--mock-row)]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f56] ring-1 ring-[#e0443e]/40" />
          <span className="size-2.5 rounded-full bg-[#ffbd2e] ring-1 ring-[#dea123]/40" />
          <span className="size-2.5 rounded-full bg-[#27c93f] ring-1 ring-[#1aab29]/40" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] px-3 py-0.5 font-mono text-[10.5px] font-medium text-[var(--text-secondary)]">
          <AppWindow className="size-3 text-[var(--text-tertiary)]" />
          <span>caide — devicelab</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Metro :8081 Running</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-center gap-5">
        {/* Device Frame (iPhone 16 Pro Style) */}
        <div className="relative w-[180px] h-[340px] rounded-[34px] border-[5px] border-slate-800 bg-black p-2.5 shadow-xl flex flex-col justify-between shrink-0 ring-1 ring-white/20">
          {/* Dynamic Island */}
          <div className="mx-auto h-3 w-16 rounded-full bg-slate-900 flex items-center justify-center" />

          {/* Running Mobile Calculator UI */}
          <div className="flex-1 flex flex-col justify-between pt-3 pb-1 text-white select-none">
            {/* Display */}
            <div className="text-right px-2">
              <div className="text-[11px] text-slate-400 font-mono">1,280 × 1.05</div>
              <div className="text-2xl font-light tracking-tight text-white font-mono mt-0.5">
                1,344
              </div>
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-4 gap-1.5 text-[11px] font-medium text-center">
              <span className="rounded-full bg-slate-700 py-1.5 text-slate-200">AC</span>
              <span className="rounded-full bg-slate-700 py-1.5 text-slate-200">+/-</span>
              <span className="rounded-full bg-slate-700 py-1.5 text-slate-200">%</span>
              <span className="rounded-full bg-amber-600 py-1.5 text-white">÷</span>

              <span className="rounded-full bg-slate-800 py-1.5 text-white">7</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">8</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">9</span>
              <span className="rounded-full bg-amber-600 py-1.5 text-white">×</span>

              <span className="rounded-full bg-slate-800 py-1.5 text-white">4</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">5</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">6</span>
              <span className="rounded-full bg-amber-600 py-1.5 text-white">-</span>

              <span className="rounded-full bg-slate-800 py-1.5 text-white">1</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">2</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">3</span>
              <span className="rounded-full bg-amber-600 py-1.5 text-white">+</span>

              <span className="col-span-2 rounded-full bg-slate-800 py-1.5 text-left pl-3 text-white">0</span>
              <span className="rounded-full bg-slate-800 py-1.5 text-white">.</span>
              <span className="rounded-full bg-amber-600 py-1.5 text-white">=</span>
            </div>
          </div>

          {/* Home Bar */}
          <div className="mx-auto h-1 w-20 rounded-full bg-white/40" />
        </div>

        {/* Floating Companion: Phone QR Code Dialog */}
        <div className="flex-1 max-w-[280px] rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-[12.5px] text-[var(--text-primary)]">
              <Smartphone className="size-4 text-sky-500" />
              <span>Phone Preview</span>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
              Live LAN
            </span>
          </div>

          {/* QR Code Graphic */}
          <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 shadow-inner">
            <div className="grid grid-cols-7 gap-1 p-1 bg-white">
              {Array.from({ length: 49 }).map((_, i) => (
                <div
                  key={i}
                  className={`size-2 rounded-[1px] ${
                    (i % 2 === 0 || i % 5 === 0 || i < 7 || i > 41 || i % 7 === 0)
                      ? "bg-slate-900"
                      : "bg-transparent"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-2">
              Scan with mobile camera
            </span>
          </div>

          {/* LAN IP URL */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--divide)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-mono">
            <span className="truncate text-[var(--text-secondary)]">http://192.168.1.76:8081</span>
            <button type="button" className="text-[var(--accent-link)] hover:opacity-80">
              <FiCopy className="size-3" />
            </button>
          </div>

          <div className="text-[10px] text-[var(--text-tertiary)] text-center">
            Both devices must be on the same local Wi-Fi network.
          </div>
        </div>
      </div>
    </div>
  );
}
