// FILE: SidebarFolderColorPicker.tsx
// Purpose: Color picker for sidebar project folder icons.

import { cn } from "~/lib/utils";
import {
  SIDEBAR_FOLDER_COLOR_OPTIONS,
  type SidebarFolderColorOption,
} from "~/lib/sidebarStatusColors";
import type { SidebarFolderColor } from "~/appSettings";
import { FolderIcon } from "~/lib/icons";

export function SidebarFolderColorPicker(props: {
  value: SidebarFolderColor;
  onValueChange: (value: SidebarFolderColor) => void;
  ariaLabel?: string;
}) {
  const { value, onValueChange, ariaLabel = "Sidebar project folder color" } = props;

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {SIDEBAR_FOLDER_COLOR_OPTIONS.map((option: SidebarFolderColorOption) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            className={cn(
              "group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "border-foreground bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/20"
                : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
            onClick={() => onValueChange(option.value)}
          >
            <FolderIcon aria-hidden="true" className={cn("size-3.5 shrink-0", option.iconClass)} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
