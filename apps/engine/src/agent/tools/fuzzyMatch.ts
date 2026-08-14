// FILE: src/agent/tools/fuzzyMatch.ts

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

export function fuzzyLineMatch(
  fileContent: string,
  targetContent: string,
  startLine?: number
): { startIndex: number; endIndex: number; score: number } | null {
  const fileLines = fileContent.split(/\r?\n/);
  const targetLines = targetContent.split(/\r?\n/);
  
  if (targetLines.length === 0 || fileLines.length === 0) return null;

  let bestMatch: { startIndex: number; endIndex: number; score: number } | null = null;
  let bestScore = -1;

  const searchStart = startLine ? Math.max(0, startLine - 1) : 0;

  for (let startIdx = searchStart; startIdx <= fileLines.length - targetLines.length; startIdx++) {
    let matchCount = 0;
    
    for (let i = 0; i < targetLines.length; i++) {
      const fLine = fileLines[startIdx + i]!.trim();
      const tLine = targetLines[i]!.trim();
      
      if (fLine === tLine) {
        matchCount += 1;
      } else {
        const dist = levenshtein(fLine, tLine);
        const maxLen = Math.max(fLine.length, tLine.length);
        const ratio = maxLen === 0 ? 1 : 1 - dist / maxLen;
        matchCount += ratio;
      }
    }
    
    const score = matchCount / targetLines.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        startIndex: startIdx,
        endIndex: startIdx + targetLines.length,
        score,
      };
    }
  }

  if (bestScore >= 0.9 && bestMatch) {
    return bestMatch;
  }
  
  return null;
}

export function applyFuzzyEdit(
  fileContent: string,
  targetContent: string,
  replacementContent: string,
  startLine?: number
): string | null {
  const match = fuzzyLineMatch(fileContent, targetContent, startLine);
  if (!match) return null;

  const getLineOffsets = (text: string) => {
    const offsets: { start: number; end: number }[] = [];
    let currentStart = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        offsets.push({ start: currentStart, end: i + 1 });
        currentStart = i + 1;
      }
    }
    offsets.push({ start: currentStart, end: text.length });
    return offsets;
  };

  const offsets = getLineOffsets(fileContent);
  const startOffset = offsets[match.startIndex]!.start;
  // If match.endIndex is out of bounds, use the end of the file.
  const endOffset = match.endIndex < offsets.length 
    ? offsets[match.endIndex]!.start 
    : fileContent.length;

  return (
    fileContent.slice(0, startOffset) +
    replacementContent +
    (fileContent[endOffset - 1] === '\n' && replacementContent[replacementContent.length - 1] !== '\n' ? '\n' : '') +
    fileContent.slice(endOffset)
  );
}
