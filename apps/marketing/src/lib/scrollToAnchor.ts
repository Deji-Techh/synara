"use client";

export function scrollToAnchor(anchor: string, event?: { preventDefault: () => void }): boolean {
  const target = document.getElementById(anchor);
  if (!target) return false;
  event?.preventDefault();
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  history.replaceState(null, "", `#${anchor}`);
  return true;
}
