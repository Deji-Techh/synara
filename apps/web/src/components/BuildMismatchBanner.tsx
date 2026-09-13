// FILE: BuildMismatchBanner.tsx
// Purpose: Stale-build tripwire. The desktop single-instance trap means
// launching a new build can just focus the OLD window — the user then
// debugs symptoms their build never contained. When the client's baked
// commit differs from the connected server's buildSha, a dismissible
// banner tells them to quit fully and reopen (per-session dismiss; the
// Settings → Build row keeps the persistent record).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CAIDE_BUILD_SHA } from "~/branding";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";
import { cn } from "~/lib/utils";

export function BuildMismatchBanner() {
  const [dismissed, setDismissed] = useState(false);
  const configQuery = useQuery(serverConfigQueryOptions());
  const server = configQuery.data?.buildSha ?? null;
  const mismatch =
    !dismissed &&
    CAIDE_BUILD_SHA !== "dev" &&
    typeof server === "string" &&
    server.length > 0 &&
    server !== "unknown" &&
    CAIDE_BUILD_SHA !== server;
  if (!mismatch) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-3 border-b border-destructive/40",
        "bg-destructive/10 px-4 py-1.5 text-center text-[12px]",
      )}
    >
      <span className="text-foreground/90">
        App updated — quit Caide fully and reopen it to run the latest build
        <span className="text-muted-foreground">
          {" "}
          (client {CAIDE_BUILD_SHA.slice(0, 8)} ≠ server {server.slice(0, 8)})
        </span>
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
