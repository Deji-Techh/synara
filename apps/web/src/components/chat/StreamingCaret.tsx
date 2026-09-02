// FILE: StreamingCaret.tsx
// Purpose: iOS-style streaming caret — a soft-blink cursor that sits at the end of the
//          last line of streamed text and glides along as the reveal grows.
// Layer: Web chat presentation component
// Exports: StreamingCaret
// Why: The markdown tree is a set of block elements, so an in-flow caret would land on a
//      new line after the last paragraph. Instead the caret is positioned absolutely at
//      the end of the deepest last text node, measured via a collapsed Range (exact
//      insertion point even when the final paragraph wraps over several lines).

import { useEffect, useRef, type RefObject } from "react";

interface StreamingCaretProps {
  /** The markdown container whose last text line hosts the caret. */
  containerRef: RefObject<HTMLElement | null>;
  /** Changes whenever the revealed text grows, so the caret re-measures in sync. */
  revision: number;
}

const EXCLUDED_SELECTOR = "img, figure, button, select, input, textarea, [data-caide-card]";

function findLastTextNodeInElement(root: Element): Text | null {
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

export function StreamingCaret({ containerRef, revision }: StreamingCaretProps) {
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const caret = caretRef.current;
    if (!container || !caret) {
      return;
    }

    let disposed = false;

    const measureAndPosition = () => {
      if (disposed || !container.isConnected || !caret.isConnected) {
        return;
      }
      // Only walk the last block element, not the entire container — O(1) vs O(n).
      const lastBlock = container.lastElementChild;
      let targetNode: Text | null = null;
      let targetElement: Element | null = null;

      if (
        lastBlock &&
        !lastBlock.hasAttribute("data-caret-anchor") &&
        !lastBlock.querySelector("[data-caret-anchor]")
      ) {
        // Last block is the streamed markdown block (p, pre, etc.) — walk only it.
        if (!lastBlock.closest(EXCLUDED_SELECTOR)) {
          targetNode = findLastTextNodeInElement(lastBlock);
          targetElement = lastBlock;
        }
      }

      if (!targetNode) {
        // Fallback: no text in last block (e.g., last block is a card) — hide caret.
        caret.style.opacity = "0";
        return;
      }

      const range = document.createRange();
      range.setStart(targetNode, targetNode.length);
      range.setEnd(targetNode, targetNode.length);
      const rect = range.getBoundingClientRect();
      // Collapsed range at end can be zero rect if node not rendered — hide.
      if (rect.width === 0 && rect.height === 0 && rect.x === 0 && rect.y === 0) {
        caret.style.opacity = "0";
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const lineHeightPx = targetElement
        ? parseFloat(getComputedStyle(targetElement).lineHeight)
        : 0;
      const h = Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx * 0.75 : undefined;

      caret.style.opacity = "";
      caret.style.transform = `translate(${Math.round(rect.left - containerRect.left)}px, ${Math.round(rect.top - containerRect.top)}px)`;
      if (h !== undefined) {
        caret.style.height = `${Math.round(h)}px`;
      }
    };

    const scheduleMeasure = () => {
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measureAndPosition();
      });
    };

    // Coalesce all triggers via rAF — avoids layout thrash from synchronous reads.
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });

    scheduleMeasure();

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [containerRef]);

  // Revision change schedules a measure without causing a React re-render for position.
  useEffect(() => {
    const container = containerRef.current;
    const caret = caretRef.current;
    if (!container || !caret) {
      return;
    }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const lastBlock = container.lastElementChild;
        let targetNode: Text | null = null;
        let targetElement: Element | null = null;
        if (lastBlock && !lastBlock.closest(EXCLUDED_SELECTOR)) {
          targetNode = findLastTextNodeInElement(lastBlock);
          targetElement = lastBlock;
        }
        if (!targetNode) {
          caret.style.opacity = "0";
          return;
        }
        const range = document.createRange();
        range.setStart(targetNode, targetNode.length);
        range.setEnd(targetNode, targetNode.length);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && rect.x === 0 && rect.y === 0) {
          caret.style.opacity = "0";
          return;
        }
        const containerRect = container.getBoundingClientRect();
        const lineHeightPx = targetElement
          ? parseFloat(getComputedStyle(targetElement).lineHeight)
          : 0;
        const h =
          Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx * 0.75 : undefined;
        caret.style.opacity = "";
        caret.style.transform = `translate(${Math.round(rect.left - containerRect.left)}px, ${Math.round(rect.top - containerRect.top)}px)`;
        if (h !== undefined) {
          caret.style.height = `${Math.round(h)}px`;
        }
      });
    }
  }, [containerRef, revision]);

  return (
    <span
      ref={caretRef}
      aria-hidden="true"
      className="streaming-caret"
      style={{ transform: "translate(0, 0)" }}
    />
  );
}
