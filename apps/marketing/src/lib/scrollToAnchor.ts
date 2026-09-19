"use client";

export function scrollToAnchor(
  anchor: string,
  event?: { preventDefault: () => void },
  offset = 88,
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const target = document.getElementById(anchor);
  if (!target) return false;

  event?.preventDefault();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const elementPosition = target.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - offset;

  window.scrollTo({
    top: Math.max(0, offsetPosition),
    behavior: reduceMotion ? "auto" : "smooth",
  });

  try {
    history.replaceState(null, "", `#${anchor}`);
  } catch {
    // Ignore if history state cannot be modified
  }

  // Trigger highlight pulse on destination
  target.classList.remove("section-target-highlight");
  // Trigger reflow to restart animation
  void target.offsetWidth;
  target.classList.add("section-target-highlight");

  setTimeout(() => {
    target.classList.remove("section-target-highlight");
  }, 1800);

  return true;
}
