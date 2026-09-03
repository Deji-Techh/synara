// FILE: searchReplaceProcessor.ts
// Purpose: Cascading fuzzy line matching + block application for
// search_replace / multi_replace.
// Donor: dyad x caide src/pro/main/ipc/processors/search_replace_processor.ts
// (verbatim matching logic; electron-log → console; Supabase/telemetry/lock
// wrappers live at the tool layer, not here).
//
// Pass 1: Exact Match
// Pass 2: Trailing Whitespace Ignored
// Pass 3: All Edge Whitespace Ignored
// Pass 4: Unicode Normalization

import { parseSearchReplaceBlocks } from "./searchReplaceParser.ts";
import { normalizeString } from "./textNormalization.ts";

function unescapeMarkers(content: string): string {
  return content
    .replace(/^\\<<<<<<</gm, "<<<<<<<")
    .replace(/^\\=======/gm, "=======")
    .replace(/^\\>>>>>>>/gm, ">>>>>>>");
}

type LineComparator = (fileLine: string, patternLine: string) => boolean;

/** Pass 1: Exact Match — file_line == pattern_line */
const exactMatch: LineComparator = (fileLine, patternLine) =>
  fileLine === patternLine;

/** Pass 2: Trailing Whitespace Ignored */
const trailingWhitespaceIgnored: LineComparator = (fileLine, patternLine) =>
  fileLine.trimEnd() === patternLine.trimEnd();

/** Pass 3: All Edge Whitespace Ignored */
const allEdgeWhitespaceIgnored: LineComparator = (fileLine, patternLine) =>
  fileLine.trim() === patternLine.trim();

/** Pass 4: Unicode Normalization (smart quotes, dashes, nbsp…) */
const unicodeNormalized: LineComparator = (fileLine, patternLine) =>
  normalizeString(fileLine.trim()) === normalizeString(patternLine.trim());

const MATCHING_PASSES: Array<{ name: string; comparator: LineComparator }> = [
  { name: "exact", comparator: exactMatch },
  { name: "trailing-whitespace-ignored", comparator: trailingWhitespaceIgnored },
  { name: "all-edge-whitespace-ignored", comparator: allEdgeWhitespaceIgnored },
  { name: "unicode-normalized", comparator: unicodeNormalized },
];

function trimEmptyLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && result[0] === "") {
    result.shift();
  }
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

function findMatchPositions(
  resultLines: string[],
  searchLines: string[],
  comparator: LineComparator,
): number[] {
  const positions: number[] = [];

  for (let i = 0; i <= resultLines.length - searchLines.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (!comparator(resultLines[i + j], searchLines[j])) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      positions.push(i);
      // For ambiguity detection, we only need to know if there's more than one
      if (positions.length > 1) break;
    }
  }

  return positions;
}

function cascadingMatch(
  resultLines: string[],
  searchLines: string[],
): { matchIndex: number; error?: string; passName?: string } {
  for (const pass of MATCHING_PASSES) {
    const positions = findMatchPositions(resultLines, searchLines, pass.comparator);

    if (positions.length > 1) {
      return {
        matchIndex: -1,
        error: `Search block matched multiple locations in the target file (ambiguous, detected in ${pass.name} pass)`,
      };
    }

    if (positions.length === 1) {
      return { matchIndex: positions[0], passName: pass.name };
    }
  }

  return {
    matchIndex: -1,
    error: "Search block did not match any content in the target file.",
  };
}

export function applySearchReplace(
  originalContent: string,
  diffContent: string,
): {
  success: boolean;
  content?: string;
  error?: string;
} {
  const blocks = parseSearchReplaceBlocks(diffContent);
  if (blocks.length === 0) {
    return {
      success: false,
      error:
        "Invalid diff format - missing required sections. Expected <<<<<<< SEARCH / ======= / >>>>>>> REPLACE",
    };
  }

  const lineEnding = originalContent.includes("\r\n") ? "\r\n" : "\n";
  let resultLines = originalContent.split(/\r?\n/);
  let appliedCount = 0;

  for (const block of blocks) {
    let { searchContent, replaceContent } = block;

    searchContent = unescapeMarkers(searchContent);
    replaceContent = unescapeMarkers(replaceContent);

    let searchLines = searchContent === "" ? [] : searchContent.split(/\r?\n/);
    const replaceLines =
      replaceContent === "" ? [] : replaceContent.split(/\r?\n/);

    if (searchLines.length === 0) {
      return {
        success: false,
        error: "Invalid diff format - empty SEARCH block is not allowed",
      };
    }

    if (searchLines.join("\n") === replaceLines.join("\n")) {
      console.warn("Search and replace blocks are identical");
    }

    let matchResult = cascadingMatch(resultLines, searchLines);

    // Fallback: trim leading/trailing empty lines and retry (non-ambiguous only)
    if (matchResult.error && !matchResult.error.includes("ambiguous")) {
      const trimmedSearchLines = trimEmptyLines(searchLines);
      if (trimmedSearchLines.length !== searchLines.length) {
        const trimmedResult = cascadingMatch(resultLines, trimmedSearchLines);
        if (!trimmedResult.error) {
          matchResult = trimmedResult;
          searchLines = trimmedSearchLines;
        }
      }
    }

    if (matchResult.error) {
      return { success: false, error: matchResult.error };
    }

    const matchIndex = matchResult.matchIndex;

    const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length);

    // Preserve indentation relative to first matched line
    const originalIndents = matchedLines.map((line) => {
      const m = line.match(/^[\t ]*/);
      return m ? m[0] : "";
    });
    const searchIndents = searchLines.map((line) => {
      const m = line.match(/^[\t ]*/);
      return m ? m[0] : "";
    });

    const indentedReplaceLines = replaceLines.map((line) => {
      const matchedIndent = originalIndents[0] || "";
      const currentIndentMatch = line.match(/^[\t ]*/);
      const currentIndent = currentIndentMatch ? currentIndentMatch[0] : "";
      const searchBaseIndent = searchIndents[0] || "";

      const searchBaseLevel = searchBaseIndent.length;
      const currentLevel = currentIndent.length;
      const relativeLevel = currentLevel - searchBaseLevel;

      const finalIndent =
        relativeLevel < 0
          ? matchedIndent.slice(0, Math.max(0, matchedIndent.length + relativeLevel))
          : matchedIndent + currentIndent.slice(searchBaseLevel);

      return finalIndent + line.trim();
    });

    const beforeMatch = resultLines.slice(0, matchIndex);
    const afterMatch = resultLines.slice(matchIndex + searchLines.length);
    resultLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch];
    appliedCount++;
  }

  if (appliedCount === 0) {
    return { success: false, error: "No search/replace blocks could be applied" };
  }
  return { success: true, content: resultLines.join(lineEnding) };
}
