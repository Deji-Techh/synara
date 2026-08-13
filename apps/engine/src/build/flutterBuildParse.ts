// FILE: src/build/flutterBuildParse.ts
// Purpose: Parsers for `flutter build` and `flutter test` output. Keep pure
// and unit-testable; the engine's build/state + test/run handlers use these to
// turn raw CLI output into structured diagnostics for the QualityGate/Tests
// panes.
// Layer: Engine build parsing

export type BuildTarget = "apk" | "appbundle" | "ipa";
export type BuildStatus = "running" | "succeeded" | "failed";

/** Flutter prints the built artifact path, e.g. "✓  Built build/app/outputs/...". */
export function parseFlutterBuildOutputPath(
  logs: readonly string[],
  target: BuildTarget,
  fallback: string,
): string {
  for (const line of logs) {
    const match = line.match(/Built\s+(.+\.(?:apk|aab|xcarchive))/i);
    const artifact = match?.[1]?.trim();
    if (artifact) {
      return artifact;
    }
  }
  return fallback;
}
