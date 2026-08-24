// FILE: CreateAppDialog.tsx
// Purpose: Dialog for creating a new Flutter app under ~/caide-apps.
// Mirrors dyad x caide's createApp flow (name → slug → Flutter scaffold).
// Layer: Web UI dialog

import { useCallback, useEffect, useId, useState } from "react";

import type { AppCreateResult, ProjectFramework } from "@caide/contracts";

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
import { readNativeApi } from "../nativeApi";
import { generateCuteAppName, toAppSlug } from "../lib/appNaming";

const FRAMEWORKS: Array<{
  id: ProjectFramework;
  label: string;
  description: string;
}> = [
  { id: "blank", label: "Blank", description: "Start from an empty workspace" },
  { id: "react-native", label: "React Native", description: "Expo / React Native mobile app" },
  { id: "flutter", label: "Flutter", description: "Flutter mobile app" },
  { id: "website", label: "Website", description: "Browser-first web application" },
];

export function CreateAppDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: AppCreateResult) => void;
}) {
  const [name, setName] = useState(generateCuteAppName());
  const [framework, setFramework] = useState<ProjectFramework>("blank");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const inputId = `${fieldId}-name`;

  useEffect(() => {
    if (props.open) {
      let initial: string | null = null;
      try {
        initial = sessionStorage.getItem("caide:home-derived-app-name");
        if (initial) sessionStorage.removeItem("caide:home-derived-app-name");
      } catch {}
      setName(initial ?? generateCuteAppName());
      setFramework("blank");
      setError(null);
      setSubmitting(false);
    }
  }, [props.open]);

  const handleRegenerate = useCallback(() => {
    setName(generateCuteAppName());
  }, []);

  const slug = toAppSlug(name);
  const nameError =
    name.trim().length === 0
      ? "Enter an app name."
      : name.trim().length > 64
        ? "App name must be 64 characters or fewer."
        : null;

  const handleSubmit = useCallback(async () => {
    if (nameError) {
      setError(nameError);
      return;
    }
    const trimmed = name.trim();
    const api = readNativeApi();
    if (!api) {
      setError("App server is unavailable.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.app.createApp({ name: trimmed, framework });
      props.onCreated?.(result);
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [name, nameError, framework, props]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>Create new app</DialogTitle>
          <DialogDescription>
            Choose a framework for <code>~/caide-apps/{slug || "..."}</code>. It is fixed for this
            project and controls preview, tools, and builds.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>App name</Label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. wandering-koala"
                maxLength={64}
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
                className="flex-1"
                aria-invalid={nameError ? true : undefined}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={submitting}
                onClick={handleRegenerate}
                aria-label="Generate random name"
                title="Generate random name"
              >
                Shuffle
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Folder: <code className="rounded bg-muted px-1 py-0.5">~/caide-apps/{slug}</code>
              </p>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                {name.trim().length}/64
              </span>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Framework</Label>
            <div className="grid grid-cols-2 gap-2">
              {FRAMEWORKS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={framework === item.id ? "default" : "outline"}
                  className="h-auto min-h-16 flex-col items-start gap-1 p-3 text-left"
                  disabled={submitting}
                  onClick={() => setFramework(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="text-xs font-normal opacity-75">{item.description}</span>
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The selected framework cannot be changed after the project is created.
            </p>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="prominent"
            onClick={() => void handleSubmit()}
            disabled={submitting || Boolean(nameError)}
          >
            {submitting ? "Creating…" : "Create app"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
