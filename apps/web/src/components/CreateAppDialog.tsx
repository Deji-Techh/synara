// FILE: CreateAppDialog.tsx
// Purpose: Minimal dialog for creating a new app under ~/caide-apps.
// Mirrors dyad x caide's createApp flow (name → getCaideAppPath → Flutter scaffold).
// Layer: Web UI dialog

import { useCallback, useEffect, useId, useState } from "react";

import type { AppCreateResult } from "@caide/contracts";

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

export function CreateAppDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: AppCreateResult) => void;
}) {
  const [name, setName] = useState(generateCuteAppName());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const inputId = `${fieldId}-name`;

  useEffect(() => {
    if (props.open) {
      setName(generateCuteAppName());
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
    const api = readNativeApi();
    if (!api) {
      setError("App server is unavailable.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // The server RPC mirrors dyad's createApp end to end: engine app row +
      // first chat + Flutter scaffold + git initial commit, then binds an
      // orchestration project + first thread to ~/caide-apps/<slug>.
      const result = await api.app.createApp({ name: trimmed });
      props.onCreated?.(result);
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
              Will be created as <code>~/caide-apps/{toAppSlug(name)}</code>
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
