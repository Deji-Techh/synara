// FILE: CreateAppDialog.tsx
// Purpose: Dialog for creating a new Flutter app under ~/caide-apps.
// Mirrors dyad x caide's createApp flow (name → slug → Flutter scaffold).
// Layer: Web UI dialog

import { useCallback, useEffect, useId, useState } from "react";

import type { AppCreateResult, FlutterAppTemplateId } from "@caide/contracts";

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

const FLUTTER_TEMPLATES: Array<{
  id: FlutterAppTemplateId;
  label: string;
  description: string;
}> = [
  { id: "blank", label: "Blank", description: "Minimal Flutter scaffold" },
  { id: "counter", label: "Counter", description: "Default counter app" },
  { id: "firebase", label: "Firebase", description: "Firebase-ready template" },
  { id: "supabase", label: "Supabase", description: "Supabase auth + DB" },
];

export function CreateAppDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: AppCreateResult) => void;
}) {
  const [name, setName] = useState(generateCuteAppName());
  const [templateId, setTemplateId] = useState<FlutterAppTemplateId>("counter");
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
      setTemplateId("counter");
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
      const result = await api.app.createApp({ name: trimmed, templateId });
      props.onCreated?.(result);
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [name, nameError, templateId, props]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>Create new app</DialogTitle>
          <DialogDescription>
            Flutter-first. This creates <code>~/caide-apps/{slug || "..."}</code> and opens its first chat.
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
            <Label>Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {FLUTTER_TEMPLATES.map((tpl) => {
                const active = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => setTemplateId(tpl.id)}
                    className={
                      active
                        ? "rounded-xl border border-foreground/15 bg-foreground text-background px-3 py-2.5 text-left transition-colors"
                        : "rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                    }
                  >
                    <div className={active ? "text-sm font-semibold" : "text-sm font-medium"}>
                      {tpl.label}
                    </div>
                    <div className={active ? "text-xs text-background/70" : "text-xs text-muted-foreground"}>
                      {tpl.description}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">All templates are Flutter. Blank is the most minimal starting point.</p>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="prominent" onClick={() => void handleSubmit()} disabled={submitting || Boolean(nameError)}>
            {submitting ? "Creating…" : "Create app"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
