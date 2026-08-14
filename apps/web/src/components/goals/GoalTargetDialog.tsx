import { useEffect, useState } from "react";
import { Loader2, Plus, Search, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoadApps } from "./stubs";
import { cn } from "@/lib/utils";

export type GoalTarget = { kind: "new" } | { kind: "existing"; appId: number };

export function GoalTargetDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (target: GoalTarget) => void;
}) {
  const { apps, loading } = useLoadApps();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(normalizedQuery),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-lg flex-col overflow-hidden p-6 gap-4">
        <DialogHeader className="shrink-0">
          <DialogTitle>Where should this goal live?</DialogTitle>
          <DialogDescription>
            A goal runs on one project. Start fresh or pick an existing
            project to run it on.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col min-h-0 space-y-4 overflow-hidden">
          <button
            type="button"
            data-testid="goal-target-new"
            onClick={() => onSelect({ kind: "new" })}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-(--background-lighter) p-3 text-left transition-colors hover:border-primary/40 hover:bg-(--background) cursor-pointer shrink-0"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Plus size={16} />
            </span>
            <span>
              <strong className="block text-sm font-medium">
                Start a new project
              </strong>
              <small className="block text-xs text-muted-foreground">
                Create a fresh project and run this goal on it.
              </small>
            </span>
          </button>

          <div className="flex items-center gap-3 shrink-0">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              or continue a previous one
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="relative shrink-0">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects…"
              className="pl-8"
              data-testid="goal-target-search"
              aria-label="Search projects"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground shrink-0">
              <Loader2 size={15} className="animate-spin" /> Loading projects
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground shrink-0">
              <FolderOpen size={20} />
              <span>
                {apps.length === 0
                  ? "No projects yet — start a new one above."
                  : "No projects match this search."}
              </span>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto max-h-[320px] pr-1 space-y-1 rounded-md border border-border/50 p-1 bg-background/50">
              <ul className="space-y-1">
                {filteredApps.map((app) => (
                  <li key={app.id}>
                    <button
                      type="button"
                      data-testid={`goal-target-app-${app.id}`}
                      onClick={() => onSelect({ kind: "existing", appId: app.id })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                        "hover:bg-(--background-lighter) cursor-pointer transition-colors",
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                        {app.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">{app.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 shrink-0 border-t border-border/40">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
