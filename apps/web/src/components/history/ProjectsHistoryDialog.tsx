// FILE: ProjectsHistoryDialog.tsx
// Purpose: Grid-view popup of every project in the app, with search, sorting, and per-card
//          actions (share, file into a collection, delete).
// Layer: Web UI surface

import type { ProjectId } from "@caide/contracts";
import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { copyTextToClipboard } from "../../hooks/useCopyToClipboard";
import {
  DEFAULT_HISTORY_SORT,
  buildProjectShareText,
  filterHistoryProjects,
  historyProjectDateLabel,
  sortHistoryProjects,
  type HistorySort,
} from "../../historyGrid.logic";
import { useCollectionsStore, collectionNamesOf } from "../../collectionsStore";
import { formatRelativeTime } from "../../lib/relativeTime";
import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  Trash2,
} from "../../lib/icons";
import type { Project } from "../../types";
import {
  Menu,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import {
  ComposerPickerMenuPopup,
  ComposerPickerMenuSubPopup,
} from "../chat/ComposerPickerMenuPopup";
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

const SORT_OPTIONS: ReadonlyArray<{ key: string; label: string; sort: HistorySort }> = [
  { key: "updatedAt:desc", label: "Newest first", sort: { by: "updatedAt", direction: "desc" } },
  { key: "updatedAt:asc", label: "Oldest first", sort: { by: "updatedAt", direction: "asc" } },
  { key: "name:asc", label: "Name A–Z", sort: { by: "name", direction: "asc" } },
  { key: "name:desc", label: "Name Z–A", sort: { by: "name", direction: "desc" } },
  {
    key: "createdAt:desc",
    label: "Recently created",
    sort: { by: "createdAt", direction: "desc" },
  },
];

function sortKeyOf(sort: HistorySort): string {
  return `${sort.by}:${sort.direction}`;
}

interface ProjectsHistoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projects: readonly Project[];
  /** Clears a project's history; the caller owns confirmation and toasts. */
  readonly onDeleteProject: (project: Project) => void;
}

export function ProjectsHistoryDialog({
  open,
  onOpenChange,
  projects,
  onDeleteProject,
}: ProjectsHistoryDialogProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  const [newCollectionName, setNewCollectionName] = useState("");

  const collections = useCollectionsStore((state) => state.collections);
  const createCollection = useCollectionsStore((state) => state.createCollection);
  const addProjectToCollection = useCollectionsStore((state) => state.addProjectToCollection);
  const removeProjectFromCollection = useCollectionsStore(
    (state) => state.removeProjectFromCollection,
  );
  const pruneProjectFromCollections = useCollectionsStore(
    (state) => state.pruneProjectFromCollections,
  );

  // Reset transient state each time the dialog opens so the grid always starts
  // from a predictable (and cheap) view.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSort(DEFAULT_HISTORY_SORT);
      setNewCollectionName("");
    }
  }, [open]);

  const collectionNames = useMemo(() => collectionNamesOf(collections), [collections]);

  const visibleProjects = useMemo(
    () => sortHistoryProjects(filterHistoryProjects(projects, query), sort),
    [projects, query, sort],
  );

  const handleShare = async (project: Project) => {
    try {
      await copyTextToClipboard(buildProjectShareText(project));
      toastManager.add({
        type: "success",
        title: "Copied share summary",
        description: `"${project.name}" details are on your clipboard.`,
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not copy",
        description: "Clipboard access was unavailable for this share summary.",
      });
    }
  };

  const isInCollection = (collectionName: string, projectId: ProjectId): boolean =>
    (collections[collectionName] ?? []).includes(projectId);

  const toggleCollection = (collectionName: string, project: Project) => {
    if (isInCollection(collectionName, project.id)) {
      removeProjectFromCollection(collectionName, project.id);
      toastManager.add({
        type: "info",
        title: "Removed from collection",
        description: `"${project.name}" removed from ${collectionName}.`,
      });
    } else {
      addProjectToCollection(collectionName, project.id);
      toastManager.add({
        type: "success",
        title: "Added to collection",
        description: `"${project.name}" added to ${collectionName}.`,
      });
    }
  };

  const createAndAddCollection = (event: KeyboardEvent<HTMLInputElement>, project: Project) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const name = newCollectionName;
    if (!name.trim()) return;
    const created = createCollection(name);
    addProjectToCollection(name.trim(), project.id);
    setNewCollectionName("");
    toastManager.add({
      type: created ? "success" : "error",
      title: created ? "Added to new collection" : "Collection already exists",
      description: created
        ? `"${project.name}" added to ${name.trim()}.`
        : `"${name.trim()}" already exists — "${project.name}" was added to it.`,
    });
  };

  const handleDelete = (project: Project) => {
    pruneProjectFromCollections(project.id);
    onDeleteProject(project);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Every project you have built. Search, sort, share, or file projects into collections.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex min-h-0 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder="Search projects…"
                className="pl-8"
                aria-label="Search projects"
              />
            </div>
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Sort projects"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border-light)] px-2.5 text-[12px] text-foreground hover:bg-[var(--color-background-button-secondary-hover)]"
                  />
                }
              >
                <span className="shrink-0 text-muted-foreground">Sort</span>
                <span className="max-w-36 truncate font-medium">
                  {SORT_OPTIONS.find((o) => o.key === sortKeyOf(sort))?.label}
                </span>
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </MenuTrigger>
              <ComposerPickerMenuPopup align="end">
                <MenuRadioGroup
                  value={sortKeyOf(sort)}
                  onValueChange={(value) => {
                    const match = SORT_OPTIONS.find((o) => o.key === value);
                    if (match) setSort(match.sort);
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
            {visibleProjects.length === 0 ? (
              <div className="flex flex-col items-center gap-1 pt-16 text-center">
                <FolderIcon className="size-8 text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-foreground">
                  {projects.length === 0 ? "No projects yet" : "No matches"}
                </p>
                <p className="max-w-xs text-[11px] text-muted-foreground">
                  {projects.length === 0
                    ? "Projects you open or build will appear here."
                    : "Try a different search term."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    collectionNames={collectionNames}
                    isInCollection={(name) => isInCollection(name, project.id)}
                    onShare={() => void handleShare(project)}
                    onToggleCollection={(name) => toggleCollection(name, project)}
                    newCollectionName={newCollectionName}
                    onNewCollectionNameChange={setNewCollectionName}
                    onNewCollectionEnter={(event) => createAndAddCollection(event, project)}
                    onDelete={() => handleDelete(project)}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function ProjectCard({
  project,
  collectionNames,
  isInCollection,
  onShare,
  onToggleCollection,
  onDelete,
  newCollectionName,
  onNewCollectionNameChange,
  onNewCollectionEnter,
}: {
  readonly project: Project;
  readonly collectionNames: readonly string[];
  readonly isInCollection: (collectionName: string) => boolean;
  readonly onShare: () => void;
  readonly onToggleCollection: (collectionName: string) => void;
  readonly onDelete: () => void;
  readonly newCollectionName: string;
  readonly onNewCollectionNameChange: (value: string) => void;
  readonly onNewCollectionEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const dateLabel = historyProjectDateLabel(project);
  const collectionLabels = collectionNames.filter(isInCollection);

  return (
    <div className="group flex items-start gap-2.5 rounded-xl border border-[color:var(--color-border-light)] bg-popover p-3 transition-colors hover:border-[color:var(--color-border-strong)]">
      <FolderIcon className="mt-0.5 size-6 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{project.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{project.folderName}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
          <span>{project.kind}</span>
          {dateLabel ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span title={dateLabel}>{formatRelativeTime(dateLabel)}</span>
            </>
          ) : null}
        </div>
        {collectionLabels.length > 0 ? (
          <div className="mt-1.5 line-clamp-1 text-[10px] text-primary">
            {collectionLabels.map((label) => `#${label}`).join("  ")}
          </div>
        ) : null}
      </div>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${project.name}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-[var(--color-background-button-secondary-hover)] hover:text-foreground"
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <ComposerPickerMenuPopup align="end">
          <MenuItem onClick={onShare}>Share</MenuItem>
          <MenuSub>
            <MenuSubTrigger>Add to collection</MenuSubTrigger>
            <ComposerPickerMenuSubPopup>
              <div className="flex flex-col gap-0.5">
                {collectionNames.length === 0 ? (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    No collections yet
                  </div>
                ) : (
                  collectionNames.map((name) => (
                    <MenuItem
                      key={name}
                      className="items-center"
                      onClick={() => onToggleCollection(name)}
                    >
                      <span className="min-w-0 flex-1">{name}</span>
                      {isInCollection(name) ? <CheckIcon className="size-3.5" /> : null}
                    </MenuItem>
                  ))
                )}
                <MenuSeparator />
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <PlusIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <Input
                    value={newCollectionName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      onNewCollectionNameChange(event.target.value)
                    }
                    onKeyDown={onNewCollectionEnter}
                    placeholder="New collection…"
                    className="h-7"
                    aria-label="New collection name"
                  />
                </div>
              </div>
            </ComposerPickerMenuSubPopup>
          </MenuSub>
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
