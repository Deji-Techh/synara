// FILE: MobileQrBranch.tsx
// Purpose: Phone-QR branch content for the preview stage — shows a scannable
// QR for the LAN preview URL so a phone on the same WiFi opens the live app.
// Layer: Chat right-dock UI (rendered inside PreviewStage BranchPopup)
// Depends on: wsNativeApi.preview.mobileUrl, lib/mobileQr, ui toast/button

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadId } from "@caide/contracts";

import { ensureNativeApi } from "~/nativeApi";
import { generateQrDataUrl } from "~/lib/mobileQr";
import { MobileQrIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

type QrStatus = "loading" | "ready" | "error";

export function MobileQrBranch(props: {
  threadId: ThreadId;
  workspaceRoot: string | null;
  /** True while the branch popup is open — refetches the LAN URL on open. */
  active: boolean;
  onStartPreview: () => void;
}) {
  const [status, setStatus] = useState<QrStatus>("loading");
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);
    try {
      const result = (await ensureNativeApi().preview.mobileUrl({
        threadId: props.threadId,
        ...(props.workspaceRoot ? { appDir: props.workspaceRoot } : {}),
      })) as { lanUrl: string; lanIp: string; restarted: boolean };
      const code = await generateQrDataUrl(result.lanUrl);
      if (requestIdRef.current !== requestId) return;
      setLanUrl(result.lanUrl);
      setQrDataUrl(code);
      setStatus("ready");
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string" && err
            ? err
            : "Could not prepare the phone preview.";
      setError(message);
      setStatus("error");
    }
  }, [props.threadId, props.workspaceRoot]);

  useEffect(() => {
    if (props.active) void load();
  }, [props.active, load]);

  const copyUrl = useCallback(async () => {
    if (!lanUrl) return;
    try {
      await navigator.clipboard.writeText(lanUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toastManager.add({ type: "error", title: "Could not copy the URL." });
    }
  }, [lanUrl]);

  const needsStart = error === "Start the preview first, then open the phone QR again.";

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <MobileQrIcon className="size-4 text-muted-foreground" />
        <p className="text-xs font-medium">Phone preview</p>
      </div>

      {status === "loading" ? (
        <p className="mt-3 text-xs text-muted-foreground">Preparing the phone QR…</p>
      ) : status === "ready" && qrDataUrl && lanUrl ? (
        <div className="mt-3 flex flex-col items-center gap-3">
          <div className="rounded-lg border border-border/40 bg-white p-2.5 shadow-sm">
            <img
              src={qrDataUrl}
              alt={`QR code for ${lanUrl}`}
              className="size-[200px] rounded-md"
              draggable={false}
            />
          </div>
          <p className="max-w-[260px] text-center text-[11px] leading-relaxed text-muted-foreground">
            Scan with your phone camera — your phone must be on the{" "}
            <span className="font-medium text-foreground">same WiFi</span> as this machine.
          </p>
          <div className="flex w-full items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px]">
              {lanUrl}
            </code>
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={copyUrl}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex w-full items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 flex-1 text-xs"
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Anyone on your WiFi can open this URL while the preview runs.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{error ?? "Something went wrong."}</p>
          <div className="flex gap-2">
            {needsStart ? (
              <Button size="sm" className="h-7 text-xs" onClick={props.onStartPreview}>
                Start preview
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
