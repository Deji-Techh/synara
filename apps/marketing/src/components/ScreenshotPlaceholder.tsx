import type { ComponentType } from "react";
import { Camera, CheckCircle2, Layers, Sparkles, Monitor, AppWindow } from "lucide-react";

export interface ScreenshotPlaceholderProps {
  badge: string;
  title: string;
  description: string;
  checklist?: string[];
  specs?: string;
  targetPath?: string;
  aspectRatio?: string;
  className?: string;
  windowTitle?: string;
}

export function ScreenshotPlaceholder({
  badge,
  title,
  description,
  checklist = [],
  specs = "3200 × 2000 (16:10) • 2x Retina",
  targetPath = "/public/screenshots/screenshot.png",
  aspectRatio = "aspect-[16/10]",
  className = "",
  windowTitle,
}: ScreenshotPlaceholderProps) {
  const displayWindowTitle =
    windowTitle || `caide — ${badge.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div
      className={`group relative flex w-full flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white text-stone-900 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18)] transition-all sm:rounded-2xl ${aspectRatio} ${className}`}
      data-screenshot-placeholder={badge}
    >
      {/* macOS Window Chrome Header */}
      <div className="relative z-20 flex h-9 shrink-0 items-center justify-between border-b border-black/[0.06] bg-slate-50/90 px-3.5 sm:h-10 sm:px-4 backdrop-blur-md">
        {/* Window Traffic Lights */}
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f56] ring-1 ring-[#e0443e]/40" />
          <span className="size-2.5 rounded-full bg-[#ffbd2e] ring-1 ring-[#dea123]/40" />
          <span className="size-2.5 rounded-full bg-[#27c93f] ring-1 ring-[#1aab29]/40" />
        </div>

        {/* Center Title Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.04] bg-black/[0.03] px-3 py-0.5 font-mono text-[10.5px] font-medium text-slate-600">
          <AppWindow className="size-3 text-slate-400" />
          <span className="truncate max-w-[200px] sm:max-w-none">{displayWindowTitle}</span>
        </div>

        {/* Right Resolution Tag */}
        <div className="hidden font-mono text-[10.5px] text-slate-500 sm:block">
          {specs.split("•")[0]?.trim()}
        </div>
      </div>

      {/* Main Studio Canvas Area with Realistic IDE Wireframe Silhouette */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-6 bg-[#f8fafc]/50">
        {/* Subtle Background Architectural IDE Silhouette */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid grid-cols-12 opacity-35 select-none"
        >
          {/* Left Sidebar Pane (Cols 1-3) */}
          <div className="col-span-3 flex flex-col gap-2.5 border-r border-black/[0.06] bg-black/[0.015] p-3">
            <div className="h-3 w-16 rounded bg-slate-300" />
            <div className="mt-2 space-y-2">
              <div className="h-5 w-full rounded-md bg-slate-200/80" />
              <div className="h-5 w-4/5 rounded-md bg-slate-200/50" />
              <div className="h-5 w-5/6 rounded-md bg-slate-200/50" />
              <div className="h-5 w-3/4 rounded-md bg-slate-200/50" />
            </div>
          </div>

          {/* Center Chat / Turn Stream (Cols 4-8) */}
          <div className="col-span-6 flex flex-col justify-between p-3">
            <div className="space-y-3">
              <div className="ml-auto h-7 w-3/5 rounded-xl bg-sky-500/15" />
              <div className="h-14 w-4/5 rounded-xl border border-black/5 bg-slate-100" />
            </div>
            <div className="h-8 w-full rounded-lg border border-black/5 bg-slate-100/60" />
          </div>

          {/* Right Live Preview Stage (Cols 9-12) */}
          <div className="col-span-3 flex items-center justify-center border-l border-black/[0.06] bg-black/[0.015] p-2">
            <div className="h-4/5 w-4/5 rounded-xl border border-black/10 bg-white/70" />
          </div>
        </div>

        {/* Floating High-Contrast White Information Card */}
        <div className="relative z-10 mx-auto flex w-full max-w-[92%] flex-col items-center rounded-xl border border-slate-200/90 bg-white/98 p-4 text-center shadow-[0_15px_35px_-5px_rgba(15,23,42,0.12)] backdrop-blur-md transition-transform duration-300 group-hover:scale-[1.01] sm:max-w-md sm:p-6">
          {/* Cerulean Blue Badge Pill */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 sm:text-[11px]">
            <Camera className="size-3" />
            <span>{badge}</span>
          </div>

          {/* Title */}
          <h4 className="mt-2.5 text-[15px] font-semibold tracking-tight text-slate-900 sm:text-[17px]">
            {title}
          </h4>

          {/* Description */}
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600 sm:text-[13px]">
            {description}
          </p>

          {/* Required Visual Elements Pills */}
          {checklist.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
              {checklist.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  <CheckCircle2 className="size-3 text-sky-600" />
                  <span>{item}</span>
                </span>
              ))}
            </div>
          )}

          {/* Footer Target File Spec */}
          <div className="mt-4 flex w-full flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10.5px] font-mono text-slate-500">
            <div className="flex items-center gap-1 truncate">
              <Layers className="size-3 text-slate-400" />
              <span className="truncate">{targetPath.replace("/public/", "")}</span>
            </div>
            <div className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-sky-600">
              <Sparkles className="size-3" />
              <span>Retina Capture Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
