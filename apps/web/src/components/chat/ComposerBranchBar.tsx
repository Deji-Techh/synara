// FILE: ComposerBranchBar.tsx
// Purpose: T3 Code style attached context strip beneath the composer surface.
// Shows workspace context (Current checkout / New worktree) and current git branch.

import { FolderIcon, GitBranchIcon, ChevronDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
} from "../ui/menu";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";

interface ComposerBranchBarProps {
  cwd?: string | null;
  branch?: string | null;
  envMode?: "local" | "worktree";
  onEnvModeChange?: (mode: "local" | "worktree") => void;
  className?: string;
}

export function ComposerBranchBar({
  cwd,
  branch,
  envMode = "local",
  onEnvModeChange,
  className,
}: ComposerBranchBarProps) {
  const displayBranch = branch?.trim() || "main";
  const envLabel = envMode === "worktree" ? "New worktree" : "Current checkout";

  return (
    <div
      className={cn(
        "chat-composer-context-strip group/composer-context -mt-4 mx-auto flex w-[calc(100%-2.75rem)] max-w-[calc(46rem-2.75rem)] items-center justify-between gap-2 overflow-x-clip overflow-y-visible ps-3.5 pe-3.5 pt-5 pb-1 text-[11px] text-muted-foreground/80 select-none",
        className,
      )}
      data-testid="composer-branch-bar"
    >
      {onEnvModeChange ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none"
              >
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                <span className="font-medium text-foreground/80 truncate">{envLabel}</span>
                <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
              </button>
            }
          />
          <ComposerPickerMenuPopup align="start" side="bottom" sideOffset={6} className="w-56">
            <MenuGroup>
              <MenuGroupLabel>Workspace</MenuGroupLabel>
              <MenuItem onClick={() => onEnvModeChange("local")} className="text-xs">
                Current checkout
              </MenuItem>
              <MenuItem onClick={() => onEnvModeChange("worktree")} className="text-xs">
                New worktree
              </MenuItem>
            </MenuGroup>
          </ComposerPickerMenuPopup>
        </Menu>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5 cursor-default text-muted-foreground/80">
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          <span className="font-medium text-foreground/80 truncate">{envLabel}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
        </div>
      )}

      <div className="min-w-0 flex items-center gap-1.5 cursor-default text-muted-foreground/80">
        <GitBranchIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate font-mono text-[11px] text-foreground/80">{displayBranch}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </div>
    </div>
  );
}
