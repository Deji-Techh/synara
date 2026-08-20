// FILE: CreateAppDialog.tsx
// Purpose: Minimal dialog for creating a new app under ~/caide-apps.
// Mirrors dyad x caide's createApp flow (name → getCaideAppPath → Flutter scaffold).
// Layer: Web UI dialog

import { useCallback, useEffect, useId, useState } from "react";

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

function toSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `app-${Date.now().toString(36)}`
  );
}

function generateCuteName(): string {
  const adjectives = [
    "wandering",
    "bouncy",
    "dapper",
    "mushy",
    "clumsy",
    "nebulous",
    "flawless",
    "nappy",
    "medical",
    "previous",
  ];
  const nouns = [
    "koala",
    "fenris",
    "overlord",
    "squirrel",
    "jigsaw",
    "gods",
    "cobra",
    "vulcan",
    "knight",
    "cobra",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj}-${noun}`.toLowerCase();
}

export function CreateAppDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (appId: string, chatId: number) => void;
}) {
  const [name, setName] = useState(generateCuteName());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const inputId = `${fieldId}-name`;

  useEffect(() => {
    if (props.open) {
      setName(generateCuteName());
      setError(null);
      setSubmitting(false);
    }
  }, [props.open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter an app name.");
      return;
    }
    const slug = toSlug(trimmed);
    if (!slug) {
      setError("App name must contain letters or numbers.");
      return;
    }
    const api = readNativeApi();
    if (!api) {
      setError("App server is unavailable.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Prefer the engine's Flutter scaffold (app.createApp) if present,
      // otherwise fall back to orchestration project.create under ~/caide-apps.
      // The fallback expands "~" server-side and creates the dir when
      // createWorkspaceRootIfMissing is true (dispatchCommandNormalization).
      const appApi = (
        api as unknown as {
          app?: {
            createApp: (p: {
              name: string;
            }) => Promise<{ app: { id: number; name: string }; chatId: number }>;
          };
        }
      ).app;
      if (appApi?.createApp) {
        const result = await appApi.createApp({ name: slug });
        props.onCreated?.(String(result.app.id), result.chatId);
        props.onOpenChange(false);
        return;
      }
      const workspaceRoot = `~/caide-apps/${slug}`;
      const now = new Date().toISOString();
      const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await api.orchestration.dispatchCommand({
        type: "project.create",
        commandId: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: projectId as unknown as never,
        kind: "project",
        title: trimmed,
        workspaceRoot,
        createWorkspaceRootIfMissing: true,
        createdAt: now,
      } as never);
      props.onCreated?.(projectId, 0);
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [name, props]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Create new app</DialogTitle>
          <DialogDescription>
            This will create a new Flutter app under <code>~/caide-apps</code> and start a chat for
            it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>App name</Label>
            <Input
              id={inputId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. wandering-koala"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Will be created as <code>~/caide-apps/{toSlug(name) || "app"}</code>
            </p>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="prominent" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Creating…" : "Create app"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
