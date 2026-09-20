// FILE: GithubConnectorCard.tsx
// Purpose: Interactive GitHub OAuth device flow card for PublishPanel and Settings.

import { useState } from "react";
import { useGithubAuth } from "~/hooks/useGithubAuth";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { CheckCircle2Icon, ExternalLinkIcon, LoaderCircleIcon, CopyIcon, CheckIcon, XIcon } from "~/lib/icons";
import { toastManager } from "~/components/ui/toast";

export function GithubConnectorCard(props: { compact?: boolean }) {
  const {
    connected,
    user,
    loading,
    deviceFlow,
    polling,
    error,
    startDeviceFlow,
    cancelDeviceFlow,
    disconnect,
  } = useGithubAuth();
  const [copied, setCopied] = useState(false);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toastManager.add({ type: "success", title: "Code copied to clipboard" });
    } catch {
      // ignore
    }
  };

  const openUrl = (url: string) => {
    if (window.desktopBridge?.openExternal) {
      void window.desktopBridge.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        <span>Checking GitHub connection…</span>
      </div>
    );
  }

  if (connected && user) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/70 p-2.5 bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="size-8 rounded-full border border-border shrink-0"
            />
          ) : (
            <div className="size-8 rounded-full bg-muted flex items-center justify-center font-semibold text-xs shrink-0">
              {user.login.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate">
                {user.name || user.login}
              </span>
              <Badge variant="secondary" className="gap-0.5 text-[10px] py-0 px-1">
                <CheckCircle2Icon className="size-2.5 text-emerald-500" /> Connected
              </Badge>
            </div>
            <a
              href={user.htmlUrl}
              onClick={(e) => {
                e.preventDefault();
                openUrl(user.htmlUrl);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5 truncate"
            >
              @{user.login}
              <ExternalLinkIcon className="size-2.5 ml-0.5 inline shrink-0" />
            </a>
          </div>
        </div>
        <Button
          size="xs"
          variant="outline"
          onClick={() => disconnect()}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  if (deviceFlow) {
    return (
      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Authorize GitHub</span>
          <Button size="xs" variant="ghost" onClick={cancelDeviceFlow}>
            <XIcon className="size-3" />
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          1. Copy your one-time code:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-center font-mono text-base font-bold tracking-wider text-foreground select-all">
            {deviceFlow.userCode}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copyCode(deviceFlow.userCode)}
            className="gap-1 shrink-0"
          >
            {copied ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          2. Enter the code at GitHub:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => openUrl(deviceFlow.verificationUri)}
            className="gap-1.5 flex-1"
          >
            <ExternalLinkIcon className="size-3.5" />
            Open GitHub
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelDeviceFlow}>
            Cancel
          </Button>
        </div>
        {polling && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
            <LoaderCircleIcon className="size-3 animate-spin text-primary" />
            <span>Waiting for authorization in browser…</span>
          </div>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-foreground">GitHub Account</div>
          <div className="text-[11px] text-muted-foreground">
            Connect to create repositories, push code, and collaborate.
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={startDeviceFlow} className="gap-1.5 shrink-0">
          Connect GitHub
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
