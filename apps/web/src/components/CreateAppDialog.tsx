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
import { FrameworkIcon } from "./FrameworkIcon";
import { cn } from "~/lib/utils";

const FRAMEWORKS: Array<{
  id: ProjectFramework;
  label: string;
  description: string;
  hint: string;
}> = [
  { id: "blank", label: "Blank", description: "Start from an empty workspace", hint: "No preview" },
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
    description: "Browser-first web application",
    hint: "Browser preview · Web build",
  },
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
            <div className="grid grid-cols-2 gap-2.5">
              {FRAMEWORKS.map((item) => {
                const selected = framework === item.id;
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
