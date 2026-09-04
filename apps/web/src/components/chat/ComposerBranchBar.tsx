// FILE: ComposerBranchBar.tsx
// Purpose: T3 Code style attached context strip beneath the composer surface.
// Shows workspace context (Current checkout) and current git branch.

import { FolderIcon, GitBranchIcon, ChevronDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

export function ComposerBranchBar({
  cwd,
  branch,
  className,
}: {
  cwd?: string | null;
  branch?: string | null;
  className?: string;
}) {
  const displayBranch = branch?.trim() || "main";
  return (
    <div
      className={cn(
        "chat-composer-context-strip group/composer-context -mt-4 mx-auto flex w-[calc(100%-2.75rem)] max-w-[calc(46rem-2.75rem)] items-center justify-between gap-2 overflow-x-clip overflow-y-visible ps-3 pe-3 pt-5 pb-1 text-[11px] text-muted-foreground/80 select-none",
        className,
      )}
      data-testid="composer-branch-bar"
    >
      <div className="flex min-w-0 items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="font-medium text-foreground/80 truncate">Current checkout</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </div>
      <div className="min-w-0 flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
        <GitBranchIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate font-mono text-[11px] text-foreground/80">{displayBranch}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </div>
    </div>
  );
}
