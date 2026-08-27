// FILE: ChatEmptyStateHero.tsx
// Purpose: Premium empty-state hero — 3 framework-aware prompts, clickable to fill composer.
// Replaces generic "Let's build" with actionable starters per AGENTS.md premium bar.

import { CaideLogo } from "~/components/CaideLogo";
import { promptsForFramework } from "~/lib/frameworkPrompts";
import type { ProjectFramework } from "@caide/contracts";

export const ChatEmptyStateHero = function ChatEmptyStateHero({
  projectName,
  framework,
  onPickPrompt,
}: {
  projectName: string | undefined;
  framework?: ProjectFramework | null;
  onPickPrompt?: (prompt: string) => void;
}) {
  const prompts = promptsForFramework(framework ?? null);
  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <CaideLogo aria-label="Caide logo" className="size-10" />
      <div className="flex flex-col items-center gap-0.5">
        <h1 className="text-2xl font-semibold text-foreground/90">Let's build</h1>
        {projectName && <span className="text-lg text-muted-foreground/40">{projectName}</span>}
      </div>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPickPrompt?.(prompt)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};
