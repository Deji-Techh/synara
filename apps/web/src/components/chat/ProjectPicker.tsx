// FILE: ProjectPicker.tsx
// Purpose: Folder selector beneath the new-chat composer that groups active folders and home
//          folders while always creating chats as rows inside the shared Chats container.
// Layer: Chat / empty-state entrypoint

import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { type ProjectId, type SpaceId } from "@caide/contracts";
import { readNativeApi } from "../../nativeApi";
import { useStore } from "../../store";
import { createSidebarDisplayThreadsSelector } from "../../storeSelectors";
import { PlusIcon, XIcon } from "~/lib/icons";
import { groupItemsBySpace, spaceDisplayName } from "~/lib/spaceGrouping";
import { useVoidSpace } from "~/voidSpaceStore";
import { cn } from "~/lib/utils";
import { ELEVATED_HOVER_SURFACE_CLASS_NAME } from "~/surfaceStyles";
import { FolderClosed } from "../FolderClosed";
import { CreateAppDialog } from "../CreateAppDialog";
import { SpaceIcon } from "../SpaceIcon";
import { PickerPanelShell } from "./PickerPanelShell";
import { PickerTriggerButton } from "./PickerTriggerButton";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSeparator,
  ComboboxTrigger,
} from "../ui/combobox";
import { useWorkspacePathsStore } from "../../workspacePathsStore";
import { useSpacesUiStore } from "../../spacesUiStore";

interface ProjectPickerProps {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  selectionMode?: "workspace-root" | "project";
  showResetToHome?: boolean;
  selectedProjectId?: ProjectId | null;
  selectedWorkspaceRoot?: string | null;
  onSelectProject?: ((projectId: ProjectId) => void | Promise<void>) | undefined;
  onSelectWorkspaceRoot?: ((workspaceRoot: string) => void) | undefined;
  onResetToHome?: (() => void | Promise<void>) | undefined;
  /** Class override for the trigger button (e.g. tighter height in the composer tray). */
  triggerClassName?: string;
  /**
   * Replaces the default PickerTriggerButton with a custom trigger element (e.g. the inline
   * project name in the new-chat heading). The element receives the combobox trigger props.
   */
  renderTrigger?: ReactElement<Record<string, unknown>>;
  /** Copy overrides for folder-tagging contexts where picking never creates a project. */
  emptyTriggerLabel?: string;
  addActionLabel?: string;
  resetActionLabel?: string;
  searchPlaceholder?: string;
}

interface ActiveFolderOption {
  projectId: ProjectId | null;
  spaceId: SpaceId | null;
  spaceName: string;
  cwd: string;
  primaryLabel: string;
  secondaryLabel: string | null;
}

/**
 * Existing projects switch the draft into that project; raw paths stay workspace roots.
 *
 * Module scope on purpose: the caller runs this inside a `try`, and React Compiler cannot lower a
 * conditional expression there — inlining it makes the whole picker skip compilation.
 */
/** Full-width action row in the picker footer (add project, reset to home). */
const PICKER_FOOTER_ACTION_CLASS_NAME = cn(
  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
  ELEVATED_HOVER_SURFACE_CLASS_NAME,
  "hover:text-[var(--color-text-foreground)]",
);

function startActiveFolderSelection(
  folder: ActiveFolderOption,
  handlers: {
    isProjectSelectionMode: boolean;
    onSelectProject?: ((projectId: ProjectId) => void | Promise<void>) | undefined;
    onSelectWorkspaceRoot?: ((workspaceRoot: string) => void) | undefined;
  },
): void | Promise<void> {
  if (folder.projectId && handlers.onSelectProject) {
    return handlers.onSelectProject(folder.projectId);
  }
  if (handlers.isProjectSelectionMode) {
    return undefined;
  }
  return handlers.onSelectWorkspaceRoot?.(folder.cwd);
}

function basenameOfPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const basename = separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1);
  return basename.length > 0 ? basename : null;
}

export const ProjectPicker = memo(function ProjectPicker({
  align: alignProp,
  side: sideProp,
  selectionMode: selectionModeProp,
  showResetToHome: showResetToHomeProp,
  selectedProjectId: selectedProjectIdProp,
  selectedWorkspaceRoot: selectedWorkspaceRootProp,
  onSelectProject,
  onSelectWorkspaceRoot,
  onResetToHome,
  triggerClassName,
  renderTrigger,
  emptyTriggerLabel: emptyTriggerLabelProp,
  addActionLabel,
  resetActionLabel: resetActionLabelProp,
  searchPlaceholder: searchPlaceholderProp,
}: ProjectPickerProps) {
  const align = alignProp ?? "start";
  const side = sideProp ?? "bottom";
  const selectionMode = selectionModeProp ?? "workspace-root";
  const showResetToHome = showResetToHomeProp ?? false;
  const selectedProjectId = selectedProjectIdProp ?? null;
  const selectedWorkspaceRoot = selectedWorkspaceRootProp ?? null;
  const emptyTriggerLabel = emptyTriggerLabelProp ?? "Work in a project";
  const resetActionLabel = resetActionLabelProp ?? "Don't work in a project";
  const searchPlaceholder = searchPlaceholderProp ?? "Search projects";
  const projects = useStore((state) => state.projects);
  const spaces = useStore((state) => state.spaces);
  const sidebarThreads = useStore(useMemo(() => createSidebarDisplayThreadsSelector(), []));
  const activeSpaceId = useSpacesUiStore((state) => state.activeSpaceId);
  const voidSpace = useVoidSpace();
  const homeDir = useWorkspacePathsStore((state) => state.homeDir);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetTriggerFocused, setResetTriggerFocused] = useState(false);
  const resetInFlightRef = useRef(false);
  const isProjectSelectionMode = selectionMode === "project";

  const activeFolderOptions = useMemo(() => {
    const seen = new Set<string>();
    const nextOptions: ActiveFolderOption[] = [];
    const projectById = new Map(projects.map((project) => [project.id, project] as const));
    const getSpaceName = (spaceId: SpaceId | null) => spaceDisplayName(spaceId, spaces, voidSpace);

    for (const project of projects.filter((project) => project.kind === "project")) {
      const folderName = basenameOfPath(project.cwd) ?? project.folderName ?? project.name;
      if (!folderName || folderName.startsWith(".") || seen.has(project.cwd)) {
        continue;
      }
      seen.add(project.cwd);
      const primaryLabel = project.localName?.trim() || folderName;
      const secondaryLabel =
        project.localName?.trim() && project.localName.trim() !== folderName ? folderName : null;
      const spaceId = project.spaceId ?? null;
      nextOptions.push({
        projectId: project.id,
        spaceId,
        spaceName: getSpaceName(spaceId),
        cwd: project.cwd,
        primaryLabel,
        secondaryLabel,
      });
    }

    if (!isProjectSelectionMode) {
      for (const thread of sidebarThreads) {
        const workspaceRoot = thread.worktreePath ?? null;
        const folderName = basenameOfPath(workspaceRoot);
        if (
          !workspaceRoot ||
          !folderName ||
          folderName.startsWith(".") ||
          seen.has(workspaceRoot)
        ) {
          continue;
        }
        seen.add(workspaceRoot);
        const spaceId = projectById.get(thread.projectId)?.spaceId ?? null;
        nextOptions.push({
          projectId: null,
          spaceId,
          spaceName: getSpaceName(spaceId),
          cwd: workspaceRoot,
          primaryLabel: folderName,
          secondaryLabel: null,
        });
      }
    }

    const selectedFolderName = basenameOfPath(selectedWorkspaceRoot);
    if (
      !isProjectSelectionMode &&
      selectedWorkspaceRoot &&
      selectedFolderName &&
      !selectedFolderName.startsWith(".") &&
      !seen.has(selectedWorkspaceRoot)
    ) {
      nextOptions.unshift({
        projectId: null,
        spaceId: activeSpaceId,
        spaceName: getSpaceName(activeSpaceId),
        cwd: selectedWorkspaceRoot,
        primaryLabel: selectedFolderName,
        secondaryLabel: null,
      });
    }

    return nextOptions;
  }, [
    activeSpaceId,
    isProjectSelectionMode,
    projects,
    selectedWorkspaceRoot,
    sidebarThreads,
    spaces,
    voidSpace,
  ]);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const matchingActiveFolderOptions = useMemo(() => {
    if (normalizedQuery.length === 0) return activeFolderOptions;
    return activeFolderOptions.filter((entry) =>
      [entry.primaryLabel, entry.secondaryLabel, entry.spaceName, entry.cwd]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [activeFolderOptions, normalizedQuery]);
  const filteredActiveFolderGroups = useMemo(
    () =>
      groupItemsBySpace({
        items: matchingActiveFolderOptions,
        spaces,
        activeSpaceId,
        spaceIdOf: (option) => option.spaceId,
        voidSpace,
      }),
    [activeSpaceId, matchingActiveFolderOptions, spaces, voidSpace],
  );
  const filteredActiveFolderOptions = useMemo(
    () => filteredActiveFolderGroups.flatMap((group) => group.items),
    [filteredActiveFolderGroups],
  );

  const selectableDirectoryPaths = useMemo(
    () => [...activeFolderOptions.map((entry) => entry.cwd)],
    [activeFolderOptions],
  );
  const filteredDirectoryPaths = useMemo(
    () => [...filteredActiveFolderOptions.map((entry) => entry.cwd)],
    [filteredActiveFolderOptions],
  );
  const selectedFolderOption = useMemo(() => {
    if (isProjectSelectionMode) {
      if (!selectedProjectId) return null;
      return activeFolderOptions.find((entry) => entry.projectId === selectedProjectId) ?? null;
    }
    if (!selectedWorkspaceRoot) return null;
    return activeFolderOptions.find((entry) => entry.cwd === selectedWorkspaceRoot) ?? null;
  }, [activeFolderOptions, isProjectSelectionMode, selectedProjectId, selectedWorkspaceRoot]);
  const triggerLabel = selectedFolderOption ? (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="min-w-0 truncate text-[var(--color-text-foreground)]">
        {selectedFolderOption.primaryLabel}
      </span>
      {selectedFolderOption.secondaryLabel ? (
        <span className="min-w-0 truncate text-muted-foreground/60 text-xs">
          {selectedFolderOption.secondaryLabel}
        </span>
      ) : null}
    </span>
  ) : (
    emptyTriggerLabel
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setErrorMessage(null);
    }
  }, []);

  const handleSelectActiveFolder = useCallback(
    (folder: ActiveFolderOption) => {
      try {
        const selection = startActiveFolderSelection(folder, {
          isProjectSelectionMode,
          onSelectProject,
          onSelectWorkspaceRoot,
        });
        void Promise.resolve(selection)
          .then(() => {
            setOpen(false);
          })
          .catch((error) => {
            setErrorMessage(error instanceof Error ? error.message : "Unable to select project.");
          });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to select project.");
      }
    },
    [isProjectSelectionMode, onSelectProject, onSelectWorkspaceRoot],
  );

  const [isCreateAppOpen, setIsCreateAppOpen] = useState(false);

  const handleAddNewProject = useCallback(async () => {
    // New flow: apps are auto-created under ~/caide-apps with a name, not via folder picker.
    // Open the CreateAppDialog instead of the native folder picker.
    setIsCreateAppOpen(true);
  }, []);

  const handleResetToHome = useCallback(() => {
    if (resetInFlightRef.current) {
      return;
    }
    resetInFlightRef.current = true;
    setErrorMessage(null);
    try {
      // Statement form, not `onResetToHome?.()` or a ternary, for the same reason as
      // `handleAddNewProject`: any value block inside a `try` is one the compiler rejects.
      let reset: void | Promise<void> | undefined;
      if (onResetToHome) {
        reset = onResetToHome();
      }
      void Promise.resolve(reset)
        .then(() => {
          resetInFlightRef.current = false;
          setOpen(false);
        })
        .catch((error) => {
          resetInFlightRef.current = false;
          setErrorMessage(error instanceof Error ? error.message : "Unable to update project.");
          setOpen(true);
        });
    } catch (error) {
      resetInFlightRef.current = false;
      setErrorMessage(error instanceof Error ? error.message : "Unable to update project.");
      setOpen(true);
    }
  }, [onResetToHome]);

  const shouldShowResetToHome = showResetToHome || isProjectSelectionMode;
  const canResetFromTrigger =
    renderTrigger === undefined && selectedFolderOption !== null && onResetToHome !== undefined;
  const addProjectLabel = addActionLabel ?? (isProjectSelectionMode ? "New project" : "New app");

  const renderActiveFolderOption = (folder: ActiveFolderOption, index: number) => {
    const selected = isProjectSelectionMode
      ? folder.projectId === selectedProjectId
      : folder.cwd === selectedWorkspaceRoot;
    return (
      <ComboboxItem
        hideIndicator={!selected}
        key={folder.cwd}
        index={index}
        value={folder.cwd}
        onClick={() => {
          handleSelectActiveFolder(folder);
        }}
        className={cn(
          selected &&
            "bg-[var(--color-background-elevated-secondary)] text-[var(--color-text-foreground)]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <FolderClosed className="size-3.5 shrink-0 text-muted-foreground/70" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="min-w-0 truncate">{folder.primaryLabel}</span>
              {folder.secondaryLabel ? (
                <span className="min-w-0 truncate text-muted-foreground/60 text-xs">
                  {folder.secondaryLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </ComboboxItem>
    );
  };

  return (
    <Combobox
      items={selectableDirectoryPaths}
      filteredItems={filteredDirectoryPaths}
      autoHighlight
      onOpenChange={handleOpenChange}
      open={open}
    >
      {renderTrigger ? (
        <ComboboxTrigger render={renderTrigger} />
      ) : (
        <div className="group/project-picker-trigger relative inline-flex min-w-0 max-w-full">
          <ComboboxTrigger
            render={
              <PickerTriggerButton
                data-testid={
                  isProjectSelectionMode ? "project-picker-trigger" : "workspace-picker-trigger"
                }
                icon={
                  <FolderClosed
                    className={cn(
                      "size-3.5 transition-opacity duration-150 ease-out motion-reduce:transition-none",
                      canResetFromTrigger && "group-hover/project-picker-trigger:opacity-0",
                      resetTriggerFocused && "opacity-0",
                    )}
                  />
                }
                label={triggerLabel}
                hideChevron
                {...(triggerClassName ? { className: triggerClassName } : {})}
              />
            }
          />
          {canResetFromTrigger ? (
            <button
              type="button"
              data-testid="project-picker-reset-trigger"
              aria-label={resetActionLabel}
              title={resetActionLabel}
              className={cn(
                "group/reset-project pointer-events-none absolute top-1/2 left-0.5 z-10 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center",
                "opacity-0 transition-opacity duration-150 ease-out",
                "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                "group-hover/project-picker-trigger:pointer-events-auto group-hover/project-picker-trigger:opacity-100",
                "motion-reduce:transition-none",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onFocus={() => setResetTriggerFocused(true)}
              onBlur={() => setResetTriggerFocused(false)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleResetToHome();
              }}
            >
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-muted-foreground/58 text-background transition-colors duration-150 group-hover/reset-project:bg-muted-foreground/75 motion-reduce:transition-none">
                <XIcon className="size-2" aria-hidden />
              </span>
            </button>
          ) : null}
        </div>
      )}
      <ComboboxPopup align={align} side={side} className="p-0">
        <PickerPanelShell
          searchInput={
            <ComboboxInput
              className="rounded-md border-border/60 bg-background shadow-none before:hidden has-focus-visible:border-neutral-500/15 has-focus-visible:ring-0 [&_input]:font-sans"
              inputClassName="ring-0"
              placeholder={searchPlaceholder}
              showTrigger={false}
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          }
          footer={
            <>
              <button
                type="button"
                className={PICKER_FOOTER_ACTION_CLASS_NAME}
                onClick={() => void handleAddNewProject()}
              >
                <PlusIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                <span className="truncate">{addProjectLabel}</span>
              </button>
              {shouldShowResetToHome ? (
                <button
                  type="button"
                  className={PICKER_FOOTER_ACTION_CLASS_NAME}
                  onClick={handleResetToHome}
                >
                  <XIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{resetActionLabel}</span>
                </button>
              ) : null}
              {errorMessage ? (
                <div className="px-2 pb-1 text-destructive text-xs">{errorMessage}</div>
              ) : null}
            </>
          }
        >
          <ComboboxEmpty>
            {activeFolderOptions.length === 0 ? "No folders found" : "No matches"}
          </ComboboxEmpty>
          <ComboboxList className="max-h-64">
            {filteredActiveFolderGroups.map((group, groupIndex) => {
              const precedingOptionCount = filteredActiveFolderGroups
                .slice(0, groupIndex)
                .reduce((count, candidate) => count + candidate.items.length, 0);
              return (
                <Fragment key={group.key}>
                  {groupIndex > 0 ? <ComboboxSeparator /> : null}
                  <ComboboxGroup>
                    <ComboboxGroupLabel className="flex items-center gap-1.5">
                      <SpaceIcon icon={group.icon} className="size-3 shrink-0" />
                      <span className="min-w-0 truncate">{group.label}</span>
                    </ComboboxGroupLabel>
                    {group.items.map((folder, index) =>
                      renderActiveFolderOption(folder, precedingOptionCount + index),
                    )}
                  </ComboboxGroup>
                </Fragment>
              );
            })}
          </ComboboxList>
        </PickerPanelShell>
      </ComboboxPopup>
      <CreateAppDialog
        open={isCreateAppOpen}
        onOpenChange={setIsCreateAppOpen}
        onCreated={(result) => {
          // The server RPC bound an orchestration project + first thread to
          // ~/caide-apps/<slug>; the Sidebar handler navigates into the new
          // chat. Here we just close the picker and select the project.
          setIsCreateAppOpen(false);
          setOpen(false);
          if (onSelectProject) {
            void onSelectProject(result.projectId);
          }
        }}
      />
    </Combobox>
  );
});
