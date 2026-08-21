// FILE: ArtifactsDialog.tsx
// Purpose: Global gallery of every build artifact (APK/AAB/IPA) ever produced
//          by the Flutter Builder engine, with search, sorting, and per-card
//          actions (share link, rename, download, delete).
// Layer: Web UI surface

import type { ArtifactRecord } from "@caide/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  DEFAULT_ARTIFACT_SORT,
  artifactKindBadge,
  artifactKindLabel,
  filterArtifacts,
  formatArtifactSize,
  sortArtifacts,
  type ArtifactSort,
} from "../../artifactsGrid.logic";
import { copyTextToClipboard } from "../../hooks/useCopyToClipboard";
import { formatRelativeTime } from "../../lib/relativeTime";
import { ArchiveIcon, ChevronDownIcon, DownloadIcon, EllipsisIcon, PencilIcon, SearchIcon, ShareIcon, Trash2 } from "../../lib/icons";
import { ensureNativeApi } from "~/nativeApi";
import { buildLocalImageUrl } from "../../lib/localImageUrls";
import {
  Menu,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ComposerPickerMenuPopup } from "../chat/ComposerPickerMenuPopup";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { RenameDialog } from "../RenameDialog";

const ARTIFACTS_QUERY_KEY = ["artifacts"] as const;

const SORT_OPTIONS: ReadonlyArray<{ key: string; label: string; sort: ArtifactSort }> = [
  { key: "createdAt:desc", label: "Newest first", sort: { by: "createdAt", direction: "desc" } },
  { key: "createdAt:asc", label: "Oldest first", sort: { by: "createdAt", direction: "asc" } },
  { key: "name:asc", label: "Name A–Z", sort: { by: "name", direction: "asc" } },
  { key: "name:desc", label: "Name Z–A", sort: { by: "name", direction: "desc" } },
  { key: "size:desc", label: "Largest first", sort: { by: "size", direction: "desc" } },
  { key: "size:asc", label: "Smallest first", sort: { by: "size", direction: "asc" } },
  { key: "kind:asc", label: "By kind", sort: { by: "kind", direction: "asc" } },
];

const SORT_STORAGE_KEY = "caide:artifacts:sort:v1";

function sortKeyOf(sort: ArtifactSort): string {
  return `${sort.by}:${sort.direction}`;
}

function loadStoredSort(): ArtifactSort {
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_ARTIFACT_SORT;
    const match = SORT_OPTIONS.find((option) => option.key === raw);
    return match?.sort ?? DEFAULT_ARTIFACT_SORT;
  } catch {
    return DEFAULT_ARTIFACT_SORT;
  }
}

function storeSort(sort: ArtifactSort): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, sortKeyOf(sort));
  } catch {
    // Storage unavailable (private mode etc.) — sort just won't persist.
  }
}

export function ArtifactsDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArtifactSort>(DEFAULT_ARTIFACT_SORT);
  const [renameTarget, setRenameTarget] = useState<ArtifactRecord | null>(null);
  const queryClient = useQueryClient();

  const artifactsQuery = useQuery({
    queryKey: ARTIFACTS_QUERY_KEY,
    queryFn: () => ensureNativeApi().artifacts.list({}),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSort(loadStoredSort());
      void queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
    }
  }, [open, queryClient]);

  const records = artifactsQuery.data?.artifacts ?? [];
  const visibleArtifacts = useMemo(
    () => sortArtifacts(filterArtifacts(records, query), sort),
    [records, query, sort],
  );

  const changeSort = (next: ArtifactSort) => {
    setSort(next);
    storeSort(next);
  };

  const handleShare = async (artifact: ArtifactRecord) => {
    try {
      const { url } = await resolveArtifactDownloadUrl(artifact);
      await copyTextToClipboard(url);
      toastManager.add({
        type: "success",
        title: "Download link copied",
        description: `"${artifact.displayName}" can be downloaded from this machine for 24 hours.`,
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not create share link",
        description: "The artifact file may have been moved or deleted.",
      });
    }
  };

  const handleDownload = async (artifact: ArtifactRecord) => {
    try {
      const { url, fileName } = await resolveArtifactDownloadUrl(artifact);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not start download",
        description: "The artifact file may have been moved or deleted.",
      });
    }
  };

  const handleDelete = async (artifact: ArtifactRecord) => {
    const api = ensureNativeApi();
    const confirmed = await api.dialogs.confirm(
      `Delete "${artifact.displayName}"?\nThis removes the saved copy (${formatArtifactSize(artifact.sizeBytes)}); the app project itself is untouched.`,
    );
    if (!confirmed) return;
    try {
      await api.artifacts.delete({ artifactId: artifact.id });
      await queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
      toastManager.add({
        type: "success",
        title: "Artifact deleted",
        description: `"${artifact.displayName}" was removed.`,
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not delete artifact",
        description: "Please try again.",
      });
    }
  };

  const handleRenameSave = async (nextName: string) => {
    if (!renameTarget) return;
    try {
      await ensureNativeApi().artifacts.rename({
        artifactId: renameTarget.id,
        displayName: nextName,
      });
      await queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
      toastManager.add({
        type: "success",
        title: "Artifact renamed",
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not rename artifact",
        description: "Please try again.",
      });
    } finally {
      setRenameTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Artifacts</DialogTitle>
          <DialogDescription>
            Every APK, AAB, and IPA you have built. Share, rename, download, or delete saved
            builds.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex min-h-0 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder="Search artifacts…"
                className="pl-8"
                aria-label="Search artifacts"
              />
            </div>
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Sort artifacts"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border-light)] px-2.5 text-[12px] text-foreground hover:bg-[var(--color-background-button-secondary-hover)]"
                  />
                }
              >
                <span className="shrink-0 text-muted-foreground">Sort</span>
                <span className="max-w-36 truncate font-medium">
                  {SORT_OPTIONS.find((option) => option.key === sortKeyOf(sort))?.label}
                </span>
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </MenuTrigger>
              <ComposerPickerMenuPopup align="end">
                <MenuRadioGroup
                  value={sortKeyOf(sort)}
                  onValueChange={(value) => {
                    const match = SORT_OPTIONS.find((option) => option.key === value);
                    if (match) changeSort(match.sort);
                  }}
                >
                  {SORT_OPTIONS.map((option) => (
                    <MenuRadioItem key={option.key} value={option.key}>
                      {option.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </ComposerPickerMenuPopup>
            </Menu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {visibleArtifacts.length === 0 ? (
              <div className="flex flex-col items-center gap-1 pt-16 text-center">
                <ArchiveIcon className="size-8 text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-foreground">
                  {records.length === 0 ? "No artifacts yet" : "No matches"}
                </p>
                <p className="max-w-xs text-[11px] text-muted-foreground">
                  {records.length === 0
                    ? "Every successful APK, AAB, or IPA build is saved here automatically."
                    : "Try a different search term."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visibleArtifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onShare={() => void handleShare(artifact)}
                    onRename={() => setRenameTarget(artifact)}
                    onDownload={() => void handleDownload(artifact)}
                    onDelete={() => void handleDelete(artifact)}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogPanel>
      </DialogPopup>

      <RenameDialog
        open={renameTarget !== null}
        title="Rename artifact"
        description="A display name only — the file name stays unchanged."
        initialValue={renameTarget?.displayName ?? ""}
        placeholder={renameTarget?.fileName}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRenameTarget(null);
        }}
        onSave={handleRenameSave}
      />
    </Dialog>
  );
}

/** Mint a grant-backed download URL for one artifact. */
async function resolveArtifactDownloadUrl(
  artifact: ArtifactRecord,
): Promise<{ url: string; fileName: string }> {
  const share = await ensureNativeApi().artifacts.shareUrl({ artifactId: artifact.id });
  return {
    url: buildLocalImageUrl({ src: share.filePath, grant: share.grant, download: true }),
    fileName: artifact.fileName,
  };
}

function ArtifactCard({
  artifact,
  onShare,
  onRename,
  onDownload,
  onDelete,
}: {
  readonly artifact: ArtifactRecord;
  readonly onShare: () => void;
  readonly onRename: () => void;
  readonly onDownload: () => void;
  readonly onDelete: () => void;
}) {
  const dateLabel = artifact.createdAt;

  return (
    <div className="group flex items-start gap-2.5 rounded-xl border border-[color:var(--color-border-light)] bg-popover p-3 transition-colors hover:border-[color:var(--color-border-strong)]">
      <ArchiveIcon className="mt-0.5 size-6 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {artifact.displayName}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {artifact.projectName ?? "Unknown project"}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
          <span className="rounded border border-[color:var(--color-border-light)] px-1 py-px font-semibold">
            {artifactKindBadge(artifact.kind)}
          </span>
          {artifact.channel ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{artifact.channel}</span>
            </>
          ) : null}
          <span className="text-muted-foreground/40">·</span>
          <span>{formatArtifactSize(artifact.sizeBytes)}</span>
          {dateLabel ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span title={dateLabel}>{formatRelativeTime(dateLabel)}</span>
            </>
          ) : null}
        </div>
      </div>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${artifact.displayName}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-[var(--color-background-button-secondary-hover)] hover:text-foreground"
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <ComposerPickerMenuPopup align="end">
          <MenuItem onClick={onShare}>
            <ShareIcon />
            Share download link
          </MenuItem>
          <MenuItem onClick={onDownload}>
            <DownloadIcon />
            Download
          </MenuItem>
          <MenuItem onClick={onRename}>
            <PencilIcon />
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={onDelete} className="text-destructive">
            <Trash2 />
            Delete
          </MenuItem>
        </ComposerPickerMenuPopup>
      </Menu>
    </div>
  );
}
