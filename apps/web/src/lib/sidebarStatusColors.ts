// FILE: sidebarStatusColors.ts
// Purpose: Color mappings and swatches for sidebar completion dots.

import type { SidebarCompletionDotColor } from "../appSettings";

export interface SidebarCompletionDotColorOption {
  value: SidebarCompletionDotColor;
  label: string;
  dotClass: string;
  swatchClass: string;
}

export const SIDEBAR_COMPLETION_DOT_COLOR_OPTIONS: readonly SidebarCompletionDotColorOption[] = [
  {
    value: "emerald",
    label: "Emerald",
    dotClass: "bg-emerald-500 dark:bg-emerald-400 shadow-emerald-500/30",
    swatchClass: "bg-emerald-500 border-emerald-600",
  },
  {
    value: "sky",
    label: "Sky",
    dotClass: "bg-sky-500 dark:bg-sky-400 shadow-sky-500/30",
    swatchClass: "bg-sky-500 border-sky-600",
  },
  {
    value: "violet",
    label: "Violet",
    dotClass: "bg-violet-500 dark:bg-violet-400 shadow-violet-500/30",
    swatchClass: "bg-violet-500 border-violet-600",
  },
  {
    value: "amber",
    label: "Amber",
    dotClass: "bg-amber-500 dark:bg-amber-400 shadow-amber-500/30",
    swatchClass: "bg-amber-500 border-amber-600",
  },
  {
    value: "rose",
    label: "Rose",
    dotClass: "bg-rose-500 dark:bg-rose-400 shadow-rose-500/30",
    swatchClass: "bg-rose-500 border-rose-600",
  },
  {
    value: "zinc",
    label: "Neutral",
    dotClass: "bg-zinc-400 dark:bg-zinc-300 shadow-zinc-400/30",
    swatchClass: "bg-zinc-400 border-zinc-500",
  },
] as const;

export function resolveSidebarDotColorClass(color?: SidebarCompletionDotColor): string {
  const match = SIDEBAR_COMPLETION_DOT_COLOR_OPTIONS.find((o) => o.value === color);
  return match?.dotClass ?? "bg-emerald-500 dark:bg-emerald-400 shadow-emerald-500/30";
}
