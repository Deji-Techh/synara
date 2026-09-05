// FILE: ImportProjectDialog.tsx
// Purpose: Dialog for importing an existing external project into Caide.
// Provides folder selection, automatic framework detection with manual override,
// and title configuration.
// Layer: Web UI dialog

import { useCallback, useEffect, useId, useState } from "react";
import type { ProjectFramework } from "@caide/contracts";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { readNativeApi } from "../nativeApi";
import { FrameworkIcon } from "./FrameworkIcon";
import { cn } from "~/lib/utils";

const FRAMEWORKS: Array<{
  id: ProjectFramework;
  label: string;
  description: string;
  hint: string;
}> = [
  { id: "blank", label: "Blank", description: "Standard codebase without preview runner", hint: "No preview" },
  {
    id: "react-native",
    label: "React Native",
    description: "Expo / React Native mobile app",
    hint: "Browser preview · APK build",
  },
  {
    id: "flutter",
    label: "Flutter",
    description: "Flutter mobile app",
    hint: "Device preview · APK/AAB",
  },
  {
    id: "website",
    label: "Website",
    description: "Vite / Next.js / Browser web application",
    hint: "Browser preview · Web build",
  },
];

export function ImportProjectDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (params: {
    workspaceRoot: string;
    title: string;
    framework: ProjectFramework;
  }) => Promise<void>;
}) {
  const [folderPath, setFolderPath] = useState("");
  const [title, setTitle] = useState("");
  const [framework, setFramework] = useState<ProjectFramework>("blank");
  const [detectedFramework, setDetectedFramework] = useState<ProjectFramework | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldId = useId();
  const folderInputId = `${fieldId}-folder`;
  const titleInputId = `${fieldId}-title`;

  useEffect(() => {
    if (props.open) {
      setFolderPath("");
      setTitle("");
      setFramework("blank");
      setDetectedFramework(null);
      setDetecting(false);
      setSubmitting(false);
      setError(null);
    }
  }, [props.open]);

  const detectFrameworkForPath = useCallback(async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    const api = readNativeApi();
    if (!api) return;

    setDetecting(true);
    try {
      const res = await api.projects.detectFramework({ cwd: trimmed });
      if (res) {
        setDetectedFramework(res.framework);
        setFramework(res.framework);
        if (res.title) {
          setTitle((prev) => (prev.trim().length === 0 ? res.title : prev));
        }
      }
    } catch {
      // ignore detection errors
    } finally {
      setDetecting(false);
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    const api = readNativeApi();
    if (!api) return;
    try {
      const picked = await api.dialogs.pickFolder();
      if (picked) {
        setFolderPath(picked);
        const folderBaseName = picked.split(/[/\\]/).findLast((s: string) => s.length > 0) ?? picked;
        setTitle(folderBaseName);
        void detectFrameworkForPath(picked);
      }
    } catch {
      // dialog dismissed
    }
  }, [detectFrameworkForPath]);

  const handlePathBlur = useCallback(() => {
    if (folderPath.trim()) {
      if (!title.trim()) {
        const folderBaseName = folderPath.trim().split(/[/\\]/).findLast((s: string) => s.length > 0) ?? folderPath;
        setTitle(folderBaseName);
      }
      void detectFrameworkForPath(folderPath.trim());
    }
  }, [folderPath, title, detectFrameworkForPath]);

  const handleSubmit = useCallback(async () => {
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) {
      setError("Please specify a project folder path.");
      return;
    }
    const trimmedTitle = title.trim() || trimmedPath.split(/[/\\]/).findLast((s: string) => s.length > 0) || "App";

    setSubmitting(true);
    setError(null);
    try {
      await props.onImport({
        workspaceRoot: trimmedPath,
        title: trimmedTitle,
        framework,
      });
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [folderPath, title, framework, props]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Import existing project</DialogTitle>
          <DialogDescription>
            Link an existing codebase into Caide. Choose or verify its framework to configure previews, tools, and build workflows.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor={folderInputId}>Project folder</Label>
            <div className="flex gap-2">
              <Input
                id={folderInputId}
                value={folderPath}
                onChange={(e) => {
                  setFolderPath(e.target.value);
                  setError(null);
                }}
                onBlur={handlePathBlur}
                placeholder="/path/to/my-project"
                disabled={submitting}
                className="flex-1 font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={submitting}
                onClick={() => void handlePickFolder()}
              >
                Browse…
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={titleInputId}>Project name</Label>
            <Input
              id={titleInputId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My Awesome App"
              maxLength={64}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Framework</Label>
              {detecting ? (
                <span className="text-[11px] text-muted-foreground animate-pulse">Detecting…</span>
              ) : detectedFramework ? (
                <Badge variant="secondary" size="sm" className="text-[10px]">
                  Detected: {FRAMEWORKS.find((f) => f.id === detectedFramework)?.label ?? detectedFramework}
                </Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {FRAMEWORKS.map((item) => {
                const selected = framework === item.id;
                const isDetected = detectedFramework === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => setFramework(item.id)}
                    className={cn(
                      "group relative flex h-auto min-h-[5.5rem] flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card hover:border-foreground/15 hover:bg-accent/50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-lg",
                          selected ? "bg-primary-foreground/15" : "bg-muted",
                        )}
                      >
                        <FrameworkIcon framework={item.id} size={18} />
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-medium",
                          selected && "text-primary-foreground",
                        )}
                      >
                        {item.label}
                      </span>
                      {isDetected && !selected ? (
                        <span className="rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground">
                          Detected
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-normal leading-snug",
                        selected ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium tabular-nums",
                        selected ? "text-primary-foreground/60" : "text-muted-foreground/60",
                      )}
                    >
                      {item.hint}
                    </span>
                    {selected ? (
                      <span
                        className="absolute right-2 top-2 size-2 rounded-full bg-primary-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can override the detected framework if needed. This setting configures how previews and build commands run.
            </p>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogPanel>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="prominent"
            onClick={() => void handleSubmit()}
            disabled={submitting || !folderPath.trim()}
          >
            {submitting ? "Importing…" : "Import project"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
