// FILE: ComposerBranchBar.tsx
// Purpose: T3-style pill bar glued to the bottom of the floating composer.
// Shows workspace context (Local checkout) and current git branch, mirroring
// the screenshot's "Local checkout · feature/backend-transplant" bar.
// Layer: Chat composer chrome (pure presentation, no I/O)

import { GitBranchIcon } from "lucide-react";
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
  const displayBranch = branch?.trim() || null;
  const displayCwd = cwd ? cwd.replace(/^\/Users\/[^/]+\//, "~/").replace(/^\/home\/[^/]+\//, "~/") : null;
  // T3 shows "Local checkout" when cwd is local; we always show it for Caide (all projects are local)
  // If no branch, show cwd short
  if (!displayBranch && !displayCwd) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-b-[calc(var(--composer-radius)-1px)] border-t border-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)] bg-[color-mix(in_srgb,var(--muted)_35%,transparent)] px-3 py-1.5 text-[11px] leading-none",
        className,
      )}
      data-testid="composer-branch-bar"
    >
      <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
        <span className="size-1.5 rounded-full bg-emerald-500/70" aria-hidden />
        Local checkout
      </span>
      {displayBranch ? (
        <>
          <span className="text-muted-foreground/25" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1 truncate text-muted-foreground">
            <GitBranchIcon className="size-3 shrink-0 opacity-60" />
            <span className="truncate font-mono text-[11px] tabular-nums">{displayBranch}</span>
          </span>
        </>
      ) : null}
      {displayCwd && !displayBranch ? (
        <span className="truncate font-mono text-muted-foreground/60">{displayCwd}</span>
      ) : null}
    </div>
  );
}
