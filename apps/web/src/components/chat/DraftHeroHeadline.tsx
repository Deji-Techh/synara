// FILE: DraftHeroHeadline.tsx
// Purpose: Centered empty-landing title matching T3 Code 1:1.
// Renders "What should we build in <ProjectName>?" with clickable dotted project trigger.

import { LuFolderPlus } from "react-icons/lu";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "../ui/menu";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface DraftHeroHeadlineProps {
  projectName: string | null;
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
}

export function DraftHeroHeadline({
  projectName,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: DraftHeroHeadlineProps) {
  const hasProject = Boolean(projectName);
  const displayName = projectName ?? "Choose a project";

  return (
    <h1 className="mx-auto w-full max-w-4xl text-center font-normal text-2xl sm:text-3xl text-foreground/95 tracking-tight mb-8 select-none">
      What should we build in{" "}
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                aria-label={hasProject ? "Change project" : "Choose a project"}
                className="pointer-events-auto inline-block max-w-xs truncate border-b border-dotted border-foreground/60 align-baseline text-foreground transition-colors hover:border-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                {displayName}
              </MenuTrigger>
            }
          />
          <TooltipPopup side="top">{hasProject ? "Change project" : "Choose a project"}</TooltipPopup>
        </Tooltip>
        <ComposerPickerMenuPopup
          align="center"
          side="bottom"
          sideOffset={8}
          className="max-h-80 min-w-48 w-max max-w-72 overflow-y-auto"
        >
          <MenuRadioGroup
            value={activeProjectId ?? ""}
            onValueChange={(value) => {
              if (value && value !== activeProjectId) {
                onSelectProject(value);
              }
            }}
          >
            {projects.map((p) => (
              <MenuRadioItem key={p.id} value={p.id} closeOnClick className="text-xs">
                <span className="truncate">{p.name}</span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onClick={onCreateProject} className="text-xs gap-2">
            <LuFolderPlus className="size-3.5 opacity-80" />
            <span>New project</span>
          </MenuItem>
        </ComposerPickerMenuPopup>
      </Menu>
      ?
    </h1>
  );
}
