// FILE: StreamingCaret.tsx
// Purpose: iOS-style streaming caret — a soft-blink cursor that sits at the end of the
//          last line of streamed text and glides along as the reveal grows.
// Layer: Web chat presentation component
// Exports: StreamingCaret
// Why: The markdown tree is a set of block elements, so an in-flow caret would land on a
//      new line after the last paragraph. Instead the caret is positioned absolutely at
//      the end of the deepest last text node, measured via a collapsed Range (exact
//      insertion point even when the final paragraph wraps over several lines).

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

// Visual containers whose inner text must never host the caret: cards, images,
// interactive controls. Text inside code blocks is intentionally allowed — the caret
// sits after the last code character, matching iOS behavior.
const EXCLUDED_SELECTOR = "img, figure, button, select, input, textarea, [data-caide-card]";

interface CaretPosition {
  left: number;
  top: number;
  height: number | undefined;
}

/** Deepest last non-empty text node that is not inside an excluded container. */
function findLastStreamingTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const parent = (node as Text).parentElement;
    if (text.trim().length > 0 && parent && !parent.closest(EXCLUDED_SELECTOR)) {
      last = node as Text;
    }
    node = walker.nextNode();
  }
  return last;
}

interface StreamingCaretProps {
  /** The markdown container whose last text line hosts the caret. */
  containerRef: RefObject<HTMLElement | null>;
  /** Changes whenever the revealed text grows, so the caret re-measures in sync. */
  revision: number;
}

export function StreamingCaret({ containerRef, revision }: StreamingCaretProps) {
  const [position, setPosition] = useState<CaretPosition | null>(null);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(() => setResizeTick((tick) => tick + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const node = findLastStreamingTextNode(container);
    if (!node) {
      setPosition(null);
      return;
    }
    const range = document.createRange();
    range.setStart(node, node.length);
    range.setEnd(node, node.length);
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const lineHeightPx = parseFloat(getComputedStyle(node.parentElement!).lineHeight);
    setPosition({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      height: Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx * 0.75 : undefined,
    });
  }, [containerRef, revision, resizeTick]);

  if (!position) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="streaming-caret"
      style={{ left: position.left, top: position.top, height: position.height }}
    />
  );
}