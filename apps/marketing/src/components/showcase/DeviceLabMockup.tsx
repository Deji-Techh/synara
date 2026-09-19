"use client";

import { useState } from "react";
import { Smartphone, Monitor, Terminal, Activity, QrCode, Wifi, Copy, Check } from "lucide-react";

interface DeviceItem {
  id: string;
  name: string;
  tag: string;
  subtitle: string;
  chips: string[];
  footer: string;
  Icon: typeof Smartphone;
  accentColor: string;
  accentBg: string;
  borderGlow: string;
}

const DEVICE_CARDS: DeviceItem[] = [
  {
    id: "phone",
    name: "Physical Phone Preview",
    tag: "LAN Hot Reload",
    subtitle: "Scan with your phone camera to test natively",
    chips: ["QR Code Pairing", "Expo Go App", "Haptics Enabled"],
    footer: "Local Wi-Fi network • 60 FPS",
    Icon: Smartphone,
    accentColor: "text-emerald-500",
    accentBg: "bg-emerald-500/12",
    borderGlow: "border-emerald-500/40 shadow-emerald-500/10",
  },
  {
    id: "desktop",
    name: "Desktop Web Preview",
    tag: "Live Port :8081",
    subtitle: "Real-time browser preview inside Caide Right Dock",
    chips: ["Metro Bundler", "Fast Refresh 12ms", "Responsive Viewport"],
    footer: "Dual display calculator running",
    Icon: Monitor,
    accentColor: "text-sky-500",
    accentBg: "bg-sky-500/12",
    borderGlow: "border-sky-500/40 shadow-sky-500/10",
  },
  {
    id: "metro",
    name: "Metro Compiler Stream",
    tag: "Sub-Second Sync",
    subtitle: "Live package watcher and bundle transformer",
    chips: ["Bun runtime", "Babel & Hermes", "Asset Optimization"],
    footer: "Zero compile bottlenecks",
    Icon: Terminal,
    accentColor: "text-amber-500",
    accentBg: "bg-amber-500/12",
    borderGlow: "border-amber-500/40 shadow-amber-500/10",
  },
  {
    id: "diagnostics",
    name: "Diagnostics Inspector",
    tag: "0 Errors",
    subtitle: "Instant detection of syntax and layout issues",
    chips: ["TypeScript Strict", "ESLint Pass", "Console Log Stream"],
    footer: "All health audits passing",
    Icon: Activity,
    accentColor: "text-purple-500",
    accentBg: "bg-purple-500/12",
    borderGlow: "border-purple-500/40 shadow-purple-500/10",
  },
];

export function DeviceLabMockup() {
  const [selectedId, setSelectedId] = useState("phone");
  const [copied, setCopied] = useState(false);
  const selected = DEVICE_CARDS.find((c) => c.id === selectedId) || DEVICE_CARDS[0]!;

  const handleCopy = () => {
    navigator.clipboard?.writeText("http://192.168.1.76:8081");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEVICE_CARDS.map((card) => {
          const isSelected = card.id === selectedId;
          const IconComponent = card.Icon;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setSelectedId(card.id)}
              className={`group relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? `bg-gradient-to-b from-[#1c1d22] to-[#121316] text-white shadow-xl ${card.borderGlow} ring-1 ring-white/15`
                  : "bg-white/80 dark:bg-white/[0.03] backdrop-blur-md text-[var(--text-primary)] border border-black/[0.07] dark:border-white/[0.08] shadow-xs hover:border-black/20 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex size-9 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                      isSelected
                        ? `${card.accentBg} ${card.accentColor} shadow-inner`
                        : "bg-black/[0.04] dark:bg-white/[0.08] text-[var(--text-primary)]"
                    }`}
                  >
                    <IconComponent className="size-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${
                      isSelected
                        ? "bg-white/10 text-white border border-white/15"
                        : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {card.tag}
                  </span>
                </div>

                <div
                  className={`size-3 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-white ring-4 ring-white/20"
                      : "border border-black/20 dark:border-white/20"
                  }`}
                >
                  {isSelected && <div className="size-1 rounded-full bg-black" />}
                </div>
              </div>

              <div className="mt-4">
                <div
                  className={`text-[14.5px] sm:text-[15.5px] font-semibold tracking-tight ${isSelected ? "text-white" : "text-[var(--text-primary)]"}`}
                >
                  {card.name}
                </div>
                <div
                  className={`mt-1 text-[12px] sm:text-[13px] leading-relaxed ${isSelected ? "text-slate-300" : "text-[var(--text-secondary)]"}`}
                >
                  {card.subtitle}
                </div>
              </div>

              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {card.chips.map((chip) => (
                  <span
                    key={chip}
                    className={`rounded-md px-2 py-0.5 text-[10.5px] font-mono flex items-center gap-1 ${
                      isSelected
                        ? "bg-white/10 text-slate-200"
                        : "bg-black/[0.03] dark:bg-white/[0.05] text-[var(--text-tertiary)]"
                    }`}
                  >
                    <Check className="size-2.5 text-emerald-400 shrink-0" />
                    <span>{chip}</span>
                  </span>
                ))}
              </div>

              <div
                className={`mt-4 text-[11px] font-mono ${isSelected ? "text-slate-400" : "text-[var(--text-tertiary)]"}`}
              >
                {card.footer}
              </div>
            </button>
          );
        })}
      </div>

      {/* LAN Pairing Banner with Copy */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] backdrop-blur-md px-4 py-3 text-[12px]">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Wifi className="size-3.5" />
          </div>
          <span className="text-[var(--text-secondary)] font-medium">
            Phone Live Server:{" "}
            <span className="font-mono text-[var(--text-primary)]">http://192.168.1.76:8081</span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--divide)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-mono text-[var(--text-secondary)] shadow-xs hover:bg-[var(--mock-row)] transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-500" />
              <span className="text-emerald-500">Copied IP</span>
            </>
          ) : (
            <>
              <Copy className="size-3 text-[var(--accent-link)]" />
              <span>Copy URL</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
