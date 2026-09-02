// FILE: useGlobalCommandPalette.ts
// Purpose: Global cmd+k palette — threads + files + skills + commands + settings.
// Premium: Raycast-fast, one place for everything. Additive, no breaking changes.

import { useCallback, useEffect, useState } from "react";

export function useGlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);
  return { open, setOpen };
}
