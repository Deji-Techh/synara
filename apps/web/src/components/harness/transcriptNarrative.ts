// FILE: transcriptNarrative.ts
// Purpose: Pure text helpers for collapsing repetitive assistant status
// narration in transcripts (item 16). Extracted from the retired
// HarnessTranscript strip — the helpers are still unit-tested here.
// Layer: Web chat presentation helpers (no React).

/**
 * Status-stem of an assistant narration line: lowercased, trailing
 * "— detail" clause stripped, capped. Short lines return "" (never collapsed).
 */
export function narrationStem(line: string): string {
  const cleaned = line
    .trim()
    .toLowerCase()
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/\s+/g, " ");
  return cleaned.length >= 20 ? cleaned.slice(0, 60) : "";
}

/**
 * Collapse repeated assistant status narration: a sentence whose stem already
 * appeared in `seen` is dropped; surviving first occurrences are added to
 * `seen`. Sentence-split (not line-split) so token chunks glued without
 * separators can't fuse distinct updates into one dropped line. The optional
 * set lets one memo pass share stems across token blocks separated by tool
 * rows (item 16). Pure — unit-tested.
 */
export function collapseRepetitiveLines(
  text: string,
  seen: Set<string> = new Set(),
): { text: string; collapsed: number } {
  // Keep separators so surviving paragraphs retain their formatting.
  const parts = text.split(/((?<=[.!?])\s+)/);
  const kept: string[] = [];
  let collapsed = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    const sep = parts[i + 1] ?? "";
    const stem = narrationStem(sentence);
    if (stem && seen.has(stem)) {
      collapsed++;
      continue;
    }
    if (stem) seen.add(stem);
    kept.push(sentence + sep);
  }
  return { text: kept.join("").trimEnd(), collapsed };
}
