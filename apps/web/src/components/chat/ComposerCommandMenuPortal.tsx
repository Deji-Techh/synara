// FILE: ComposerCommandMenuPortal.tsx
// Purpose: T3-style portal for the slash/mention command menu — fixed to the composer card
// geometry rather than absolute inside the editor, so it stays glued when side panels slide.
// Mirrors t3code/apps/web/src/components/chat/ChatComposer.tsx:142 ComposerCommandMenuLayer
// Layer: Chat composer chrome

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Position = {
  bottom: number;
  left: number;
  maxHeight: number;
  width: number;
};

function positionsEqual(a: Position, b: Position): boolean {
  return (
    a.bottom === b.bottom && a.left === b.left && a.maxHeight === b.maxHeight && a.width === b.width
  );
}

export function ComposerCommandMenuPortal({
  anchor,
  children,
}: {
  anchor: HTMLElement | null;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!anchor) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const form = anchor.closest<HTMLElement>('[data-chat-composer-form="true"]');
      const mainSurface = form?.querySelector<HTMLElement>(
        '[data-chat-composer-main-surface="true"]',
      );
      const rect = (mainSurface ?? form ?? anchor).getBoundingClientRect();
      const rootFontSizePx =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      // Caide uses --composer-radius, not --chat-composer-drawer-inset; fall back to 0 for inset
      const drawerInsetRem =
        Number.parseFloat(
          window.getComputedStyle(form ?? anchor).getPropertyValue("--chat-composer-drawer-inset"),
        ) || 0;
      const drawerInset = drawerInsetRem * rootFontSizePx;
      const composerOverlap = rootFontSizePx + 1;
      const next = {
        bottom: window.innerHeight - rect.top - composerOverlap,
        left: rect.left + drawerInset,
        maxHeight: Math.max(96, rect.top - 24 + composerOverlap),
        width: Math.max(0, rect.width - drawerInset * 2),
      };
      setPosition((current) => (current && positionsEqual(current, next) ? current : next));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (observer) {
      observer.observe(anchor);
      for (let element = anchor.parentElement; element; element = element.parentElement) {
        observer.observe(element);
      }
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  if (!position) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed z-[70]"
      data-composer-drawer-layer="true"
      style={{
        bottom: position.bottom,
        left: position.left,
        maxHeight: position.maxHeight,
        width: position.width,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
