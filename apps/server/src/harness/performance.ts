// harness/performance.ts — M16 Performance review pass
// Checks bundle size, re-renders, image optimization, list virtualization

import { executeTool } from "./tools";

export interface PerformanceResult {
  readonly passed: string[];
  readonly failed: string[];
  readonly score: number;
}

// M16: Check for unnecessary re-renders
async function checkReRenders(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "useMemo|useCallback|React\\.memo" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: false, detail: "No memoization patterns found" };
  }
  return { pass: true, detail: "Memoization patterns present" };
}

// M16: Check for image optimization
async function checkImageOptimization(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "Image|<img|webp|lazy|loading=" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: true, detail: "No images used" };
  }
  const lines = res.result.split("\n").filter(Boolean);
  const optimized = lines.filter((l) => l.includes("lazy") || l.includes("loading=") || l.includes("webp"));
  if (optimized.length === 0 && lines.length > 0) {
    return { pass: false, detail: `${lines.length} images without optimization` };
  }
  return { pass: true, detail: "Images appear optimized" };
}

// M16: Check for list virtualization
async function checkVirtualization(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "FlatList|VirtualizedList|FlashList|react-window|react-virtual" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    // Check if there are lists that should be virtualized
    const listRes = await executeTool("grep", { pattern: "\\.map\\(|for.*render|ListItem" }, projectDir);
    if (listRes.ok && listRes.result && !listRes.result.includes("No matches")) {
      return { pass: false, detail: "Lists found without virtualization" };
    }
    return { pass: true, detail: "No lists requiring virtualization" };
  }
  return { pass: true, detail: "Virtualization patterns present" };
}

// M16: Check for code splitting
async function checkCodeSplitting(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "React\\.lazy|import\\(|loadable|Suspense" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: false, detail: "No code splitting patterns found" };
  }
  return { pass: true, detail: "Code splitting patterns present" };
}

// M16: Run all performance checks
export async function runPerformancePass(projectDir: string): Promise<PerformanceResult> {
  const passed: string[] = [];
  const failed: string[] = [];

  const reRenders = await checkReRenders(projectDir);
  if (reRenders.pass) passed.push(`Re-renders: ${reRenders.detail}`);
  else failed.push(`Re-renders: ${reRenders.detail}`);

  const images = await checkImageOptimization(projectDir);
  if (images.pass) passed.push(`Images: ${images.detail}`);
  else failed.push(`Images: ${images.detail}`);

  const virtualization = await checkVirtualization(projectDir);
  if (virtualization.pass) passed.push(`Virtualization: ${virtualization.detail}`);
  else failed.push(`Virtualization: ${virtualization.detail}`);

  const splitting = await checkCodeSplitting(projectDir);
  if (splitting.pass) passed.push(`Code splitting: ${splitting.detail}`);
  else failed.push(`Code splitting: ${splitting.detail}`);

  const score = passed.length / (passed.length + failed.length);
  return { passed, failed, score };
}
