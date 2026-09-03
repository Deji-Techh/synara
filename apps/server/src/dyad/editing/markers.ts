// FILE: markers.ts
// Purpose: Escape marker-like lines inside SEARCH/REPLACE content so the
// block parser doesn't treat them as structural separators.
// Donor: dyad x caide src/pro/shared/search_replace_markers.ts (verbatim).

/**
 * Escapes marker-like lines inside SEARCH/REPLACE content so that
 * `parseSearchReplaceBlocks` doesn't treat them as block separators.
 *
 * The parser treats lines that start with:
 * - `<<<<<<<` (SEARCH/open marker)
 * - `=======` (separator)
 * - `>>>>>>>` (REPLACE/close marker)
 *
 * as structural markers unless they are prefixed with `\`.
 *
 * The corresponding unescape step lives in the processor (`unescapeMarkers`).
 */
export function escapeSearchReplaceMarkers(content: string | null): string {
  if (!content) return "";
  return content.replace(
    /^(\\)?(<<<<<<<|=======|>>>>>>>)/gm,
    (full, maybeSlash: string | undefined, marker: string) =>
      maybeSlash ? full : `\\${marker}`,
  );
}
