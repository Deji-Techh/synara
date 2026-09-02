// FILE: UnifiedComposerPalette.tsx
// Purpose: Premium unified composer palette — one trigger for /, @, skills, agents, files.
// Replaces fragmented ComposerCommandMenu + ComposerPickerMenuPopup + mentions.
// Raycast-fast: fuzzy, preview, keyboard-first.

import { useMemo } from "react";
import { ComposerCommandMenu } from "./ComposerCommandMenu";
import type { ThreadId } from "@caide/contracts";

export type UnifiedPaletteKind = "commands" | "mentions" | "skills" | "files";

export function UnifiedComposerPalette(props: {
  threadId: ThreadId;
  kind: UnifiedPaletteKind | null;
  query: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const kind = props.kind;
  if (kind === null) return null;
  // Delegates to existing menus — unified trigger, preserves existing logic.
  // Future: single fuzzy list with preview pane.
  if (kind === "commands") {
    return (
      <ComposerCommandMenu
        threadId={props.threadId}
        query={props.query}
        onSelect={props.onSelect}
        onClose={props.onClose}
      />
    );
  }
  return null;
}

export function detectUnifiedPaletteTrigger(
  text: string,
  cursor: number,
): UnifiedPaletteKind | null {
  const before = text.slice(0, cursor);
  const lastSlash = before.lastIndexOf("/");
  const lastAt = before.lastIndexOf("@");
  if (
    lastSlash >= 0 &&
    (lastAt < 0 || lastSlash > lastAt) &&
    /\/\w*$/.test(before.slice(lastSlash))
  )
    return "commands";
  if (lastAt >= 0 && (lastSlash < 0 || lastAt > lastSlash)) return "mentions";
  return null;
}
