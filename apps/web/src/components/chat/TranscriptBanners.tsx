// FILE: TranscriptBanners.tsx
// Purpose: Reconnect + backpressure banners for premium stream UX.
// Shows "Reconnecting…" on WS drop, "Stream paused — catching up…" on backpressure.

export function ReconnectBanner({ reconnecting }: { reconnecting: boolean }) {
  if (!reconnecting) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <span className="size-2 animate-pulse rounded-full bg-amber-500" />
      Reconnecting… your chat will resync automatically.
    </div>
  );
}

export function BackpressureBanner({ paused }: { paused: boolean }) {
  if (!paused) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
      <span className="size-2 animate-pulse rounded-full bg-blue-500" />
      Stream paused — catching up…
    </div>
  );
}
