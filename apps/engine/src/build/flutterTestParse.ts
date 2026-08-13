// FILE: src/build/flutterTestParse.ts
// Purpose: Parser for `flutter test` output -> passed/failed/skipped counts.
// Keep pure and unit-testable; the engine's test/run handler uses these to feed
// the Tests pane.
// Layer: Engine test parsing

export interface TestCounts {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/** Flutter's live counter line: `00:01 +2 -1 ~0: Some tests failed.` */
const COUNTER_LINE = /^[0-9:]+[.]?\d*\s+\+(\d+)(?:\s+-(\d+))?(?:\s+~(\d+))?/;

/**
 * Reads the final test counter line and returns the counts. Falls back to
 * scanning every counter line and keeping the highest totals (flutter rewinds
 * the line with carriage returns, so split-based parsing sees fragments).
 */
export function parseFlutterTestOutput(output: string): TestCounts {
  const counters: Array<{ passed: number; failed: number; skipped: number }> = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(COUNTER_LINE);
    if (!match) {
      continue;
    }
    counters.push({
      passed: Number(match[1] ?? 0),
      failed: Number(match[2] ?? 0),
      skipped: Number(match[3] ?? 0),
    });
  }
  if (counters.length === 0) {
    return { passed: 0, failed: 0, skipped: 0 };
  }
  // The last complete counter line carries the authoritative totals.
  return counters[counters.length - 1] ?? { passed: 0, failed: 0, skipped: 0 };
}
