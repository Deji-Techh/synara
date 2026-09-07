// FILE: HarnessVersionsCard.tsx
// Purpose: Versions timeline for harness sessions: auto-checkpointed
// snapshots per completed turn, one-click restore (two-click confirm;
// the server stashes dirty work first). Caide card primitives, theme
// tokens only.

import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { useHarnessStore } from "~/harnessStore";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";

type SendFn = (message: Record<string, unknown>) => void;

function timeAgo(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function HarnessVersionsCard(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const versions = state.sessions[props.sessionId]?.versions ?? [];
  const [open, setOpen] = useState(false);
  const [confirmHash, setConfirmHash] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Fetch only when the card has no data yet (cached versions survive
    // re-mounts via the store); refreshes come from restore actions.
    if ((state.sessions[props.sessionId]?.versions ?? []).length === 0) {
      props.send({ type: "versions_list", sessionId: props.sessionId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionId]);

  if (versions.length === 0) return null;

  const latest = versions[0];

  const restore = (hash: string) => {
    if (confirmHash !== hash) {
      setConfirmHash(hash);
      return;
    }
    setConfirmHash(null);
    setRestoring(true);
    props.send({ type: "versions_restore", sessionId: props.sessionId, hash });
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      if (!mountedRef.current) return;
      setRestoring(false);
      props.send({ type: "versions_list", sessionId: props.sessionId });
    }, 1500);
  };

  return (
    <div className="my-2 select-none">
      <CaideCard accent="neutral" onClick={() => setOpen((v) => !v)} isExpanded={open}>
        <CaideCardHeader accent="neutral">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[12px] font-semibold tracking-tight">
              {latest.message}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {timeAgo(latest.createdAt)} · {versions.length} checkpoint{versions.length === 1 ? "" : "s"}
            </span>
          </div>
          <CaideBadge accent="neutral">Versions</CaideBadge>
          <DisclosureChevron open={open} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </CaideCardHeader>
        <CaideLazyContent open={open}>
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            {versions.map((v) => (
              <li
                key={v.hash}
                className="flex items-center gap-2 py-0.5 text-[12px]"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {v.hash.slice(0, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground/90">{v.message}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {timeAgo(v.createdAt)}
                </span>
                <Button
                  size="xs"
                  variant={confirmHash === v.hash ? "destructive-outline" : "outline"}
                  disabled={restoring}
                  onClick={() => restore(v.hash)}
                >
                  {confirmHash === v.hash ? "Confirm restore?" : "Restore"}
                </Button>
              </li>
            ))}
          </ul>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}
