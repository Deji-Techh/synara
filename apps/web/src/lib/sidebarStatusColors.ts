// FILE: sidebarStatusColors.ts
// Purpose: Color mappings and swatches for sidebar completion dots.

import type { SidebarCompletionDotColor, SidebarFolderColor } from "../appSettings";

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

export interface SidebarFolderColorOption {
  value: SidebarFolderColor;
  label: string;
  iconClass: string;
  swatchClass: string;
}

export const SIDEBAR_FOLDER_COLOR_OPTIONS: readonly SidebarFolderColorOption[] = [
  {
    value: "default",
    label: "Default",
    iconClass: "text-muted-foreground/75 group-hover/project-row:text-foreground/90",
    swatchClass: "bg-muted-foreground/50 border-muted-foreground/60",
  },
  {
    value: "amber",
    label: "Amber",
    iconClass: "text-amber-500 dark:text-amber-400",
    swatchClass: "bg-amber-500 border-amber-600",
  },
  {
    value: "sky",
    label: "Sky",
    iconClass: "text-sky-500 dark:text-sky-400",
    swatchClass: "bg-sky-500 border-sky-600",
  },
  {
    value: "emerald",
    label: "Emerald",
    iconClass: "text-emerald-500 dark:text-emerald-400",
    swatchClass: "bg-emerald-500 border-emerald-600",
  },
  {
    value: "violet",
    label: "Violet",
    iconClass: "text-violet-500 dark:text-violet-400",
    swatchClass: "bg-violet-500 border-violet-600",
  },
  {
    value: "rose",
    label: "Rose",
    iconClass: "text-rose-500 dark:text-rose-400",
    swatchClass: "bg-rose-500 border-rose-600",
  },
  {
    value: "indigo",
    label: "Indigo",
    iconClass: "text-indigo-500 dark:text-indigo-400",
    swatchClass: "bg-indigo-500 border-indigo-600",
  },
  {
    value: "orange",
    label: "Orange",
    iconClass: "text-orange-500 dark:text-orange-400",
    swatchClass: "bg-orange-500 border-orange-600",
  },
] as const;

export function resolveSidebarFolderColorClass(color?: SidebarFolderColor): string {
  const match = SIDEBAR_FOLDER_COLOR_OPTIONS.find((o) => o.value === color);
  return match?.iconClass ?? "text-muted-foreground/75 group-hover/project-row:text-foreground/90";
}
