// FILE: ComposerBranchBar.tsx
// Purpose: T3 Code style attached context strip beneath the composer surface.
// Shows workspace context (Current checkout / New worktree) and interactive git branch picker.

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, GitBranchIcon, ChevronDownIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuGroup,
  MenuGroupLabel,
} from "../ui/menu";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";
import { gitBranchesQueryOptions, gitQueryKeys } from "~/lib/gitReactQuery";
import { readNativeApi } from "~/nativeApi";
import { toastManager } from "../ui/toast";

interface ComposerBranchBarProps {
  cwd?: string | null;
  branch?: string | null;
  envMode?: "local" | "worktree";
  onEnvModeChange?: (mode: "local" | "worktree") => void;
  onBranchChange?: (branch: string) => void;
  className?: string;
}

export function ComposerBranchBar({
  cwd,
  branch,
  envMode = "local",
  onEnvModeChange,
  onBranchChange,
  className,
}: ComposerBranchBarProps) {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery(gitBranchesQueryOptions(cwd ?? null));
  const [switching, setSwitching] = useState(false);

  const branches = useMemo(() => {
    if (!branchesQuery.data?.branches) return [];
    return branchesQuery.data.branches.filter((b) => !b.isRemote);
  }, [branchesQuery.data?.branches]);

  const currentBranchFromQuery = useMemo(() => {
    return branchesQuery.data?.branches?.find((b) => b.current)?.name;
  }, [branchesQuery.data?.branches]);

  const displayBranch = branch?.trim() || currentBranchFromQuery || "main";
  const envLabel = envMode === "worktree" ? "New worktree" : "Current checkout";

  const handleCheckout = useCallback(
    async (targetBranch: string) => {
      if (!cwd || targetBranch === displayBranch || switching) return;
      const api = readNativeApi();
      if (!api) return;
      setSwitching(true);
      try {
        await api.git.checkout({ cwd, branch: targetBranch });
        await queryClient.invalidateQueries({ queryKey: gitQueryKeys.branches(cwd) });
        await queryClient.invalidateQueries({ queryKey: gitQueryKeys.status(cwd) });
        onBranchChange?.(targetBranch);
        toastManager.add({
          title: "Branch switched",
          description: `Checked out ${targetBranch}`,
          type: "info",
        });
      } catch (err) {
        toastManager.add({
          title: "Checkout failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        });
      } finally {
        setSwitching(false);
      }
    },
    [cwd, displayBranch, switching, queryClient, onBranchChange],
  );

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

      {branches.length > 0 ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                disabled={switching}
                className="flex min-w-0 items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none disabled:opacity-50"
              >
                <GitBranchIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate font-mono text-[11px] text-foreground/80">
                  {switching ? "Switching…" : displayBranch}
                </span>
                <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
              </button>
            }
          />
          <ComposerPickerMenuPopup
            align="end"
            side="bottom"
            sideOffset={6}
            className="w-56 max-h-64 overflow-y-auto"
          >
            <MenuGroup>
              <MenuGroupLabel>Switch branch</MenuGroupLabel>
              {branches.map((b) => {
                const isCurrent = b.name === displayBranch;
                return (
                  <MenuItem
                    key={b.name}
                    onClick={() => void handleCheckout(b.name)}
                    className="flex items-center justify-between text-xs font-mono"
                  >
                    <span className="truncate">{b.name}</span>
                    {isCurrent ? (
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    ) : null}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          </ComposerPickerMenuPopup>
        </Menu>
      ) : (
        <div className="min-w-0 flex items-center gap-1.5 cursor-default text-muted-foreground/80">
          <GitBranchIcon className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate font-mono text-[11px] text-foreground/80">{displayBranch}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
        </div>
      )}
    </div>
  );
}
