// FILE: ProjectSelectionPopup.tsx
// Purpose: Dialog modal for selecting a project when creating a new conversation from the Conversations section header.

import { useState, useMemo } from "react";
import { FolderIcon, SearchIcon, XIcon } from "~/lib/icons";
import { LuFolderPlus } from "react-icons/lu";
import { FrameworkIcon } from "./FrameworkIcon";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { cn } from "~/lib/utils";
import type { Project } from "~/types";

export interface ProjectSelectionPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly Project[];
  threadCountsByProjectId: Map<string, number>;
  onSelectProject: (projectId: Project["id"]) => void;
  onCreateNewProject: () => void;
}

export function ProjectSelectionPopup(props: ProjectSelectionPopupProps) {
  const {
    open,
    onOpenChange,
    projects,
    threadCountsByProjectId,
    onSelectProject,
    onCreateNewProject,
  } = props;

  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.framework && p.framework.toLowerCase().includes(q)) ||
        p.folderName.toLowerCase().includes(q),
    );
  }, [projects, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#121215]/95 p-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="border-b border-white/5 p-4 pb-3">
          <DialogTitle className="text-sm font-semibold tracking-tight text-white">
            New Conversation
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/80 mt-0.5">
            Select a project to start a conversation in
          </DialogDescription>
        </DialogHeader>

        <div className="p-3">
          {/* Search bar if multiple projects */}
          {projects.length > 3 && (
            <div className="mb-2 flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-muted-foreground focus-within:border-white/20 focus-within:bg-white/[0.05]">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          )}

          {/* Project list */}
          <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {filteredProjects.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No matching projects found.
              </div>
            ) : (
              filteredProjects.map((project) => {
                const threadCount = threadCountsByProjectId.get(project.id) ?? 0;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onSelectProject(project.id);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                      "border border-transparent hover:border-white/10 hover:bg-white/[0.05] active:scale-[0.99]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] border border-white/5 text-foreground/80">
                        {project.framework && project.framework !== "blank" ? (
                          <FrameworkIcon framework={project.framework} size={15} />
                        ) : (
                          <FolderIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">
                          {project.name}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground/70">
                          {project.framework && project.framework !== "blank"
                            ? project.framework.toUpperCase()
                            : "Project"}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/80">
                        {threadCount} {threadCount === 1 ? "chat" : "chats"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 bg-white/[0.02] p-2.5 px-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onOpenChange(false);
              onCreateNewProject();
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
          >
            <LuFolderPlus className="size-3.5" />
            <span>Create new project</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground/70 hover:text-foreground"
          >
            Cancel
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
