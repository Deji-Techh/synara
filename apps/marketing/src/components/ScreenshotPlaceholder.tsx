import type { ComponentType } from "react";
import { Camera, CheckCircle2, Sparkles, Monitor, Layers } from "lucide-react";

export interface ScreenshotPlaceholderProps {
  badge: string;
  title: string;
  description: string;
  checklist?: string[];
  specs?: string;
  targetPath?: string;
  aspectRatio?: string;
  className?: string;
}

export function ScreenshotPlaceholder({
  badge,
  title,
  description,
  checklist = [],
  specs = "3200 × 2000 (16:10) • 2x Retina • Light & Dark",
  targetPath = "/public/screenshots/screenshot.png",
  aspectRatio = "aspect-[16/10]",
  className = "",
}: ScreenshotPlaceholderProps) {
  return (
    <div
      className={`relative flex w-full flex-col justify-between overflow-hidden rounded-xl border border-black/10 bg-white/95 p-6 shadow-2xl backdrop-blur-md transition-all sm:rounded-2xl sm:p-8 dark:border-white/10 dark:bg-[#16120e]/95 ${aspectRatio} ${className}`}
      data-screenshot-placeholder={badge}
    >
      {/* Blueprint grid texture background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(#000 1px, transparent 1px), radial-gradient(#000 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 10px 10px",
        }}
        aria-hidden="true"
      />

      {/* Top Bar: Badge & Target Spec */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-4 dark:border-white/5">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold tracking-wider text-orange-600 uppercase dark:text-orange-400">
          <Camera className="size-3.5" />
          <span>{badge}</span>
        </div>
        <div className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
          {specs}
        </div>
      </div>

      {/* Middle Content: Title, Description, and Checklist */}
      <div className="relative z-10 my-auto py-4">
        <div className="mb-2 flex items-center gap-2">
          <Monitor className="size-5 text-orange-600 dark:text-orange-400" />
          <h4 className="text-lg font-semibold tracking-tight text-stone-900 sm:text-xl dark:text-stone-100">
            {title}
          </h4>
        </div>
        <p className="text-[13px] leading-relaxed text-stone-600 sm:text-[14px] dark:text-stone-300">
          {description}
        </p>

        {checklist.length > 0 && (
          <div className="mt-4 rounded-lg border border-black/5 bg-stone-50/80 p-3.5 sm:p-4 dark:border-white/5 dark:bg-stone-900/50">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-stone-500 uppercase dark:text-stone-400">
              Required in this screenshot:
            </p>
            <ul className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2 sm:text-[13px]">
              {checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-stone-700 dark:text-stone-300">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bottom Footer: File Target */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 text-[11px] text-stone-500 dark:border-white/5 dark:text-stone-400">
        <div className="flex items-center gap-1.5 font-mono">
          <Layers className="size-3.5 text-stone-400" />
          <span>Placeholder for: <code className="text-stone-800 dark:text-stone-200">{targetPath}</code></span>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400">
          <Sparkles className="size-3" />
          <span>Screenshot Capture Pending</span>
        </div>
      </div>
    </div>
  );
}
