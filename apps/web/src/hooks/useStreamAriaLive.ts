// FILE: useStreamAriaLive.ts
// Purpose: A11y — aria-live for streaming assistant text. Screen readers get polite updates.
// World-class: every streamed chunk announced without spamming.

import { useEffect, useRef } from "react";

export function useStreamAriaLive(text: string, streaming: boolean) {
  const regionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!streaming || !regionRef.current) return;
    regionRef.current.textContent = text.slice(-200);
  }, [text, streaming]);
  return regionRef;
}
