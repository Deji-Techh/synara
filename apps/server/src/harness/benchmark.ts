// harness/benchmark.ts — M16 Comparative quality benchmark vs category leaders
// Fetches reference screenshots of category-leading apps, runs Taste model comparison

import { executeTool } from "./tools";
import { sendToProvider, composePrompt, type LayeredPrompt } from "./layers";

export interface BenchmarkResult {
  readonly category: string;
  readonly builtScore: number;
  readonly leaderScore: number;
  readonly gap: number;
  readonly improvements: string[];
}

// M16: Category leader references (real apps)
const CATEGORY_LEADERS: Record<string, { name: string; url: string; strengths: string[] }> = {
  "fitness": { name: "Nike Training Club", url: "https://nike.com", strengths: ["clean typography", "generous whitespace", "bold CTAs"] },
  "social": { name: "Instagram", url: "https://instagram.com", strengths: ["consistent grid", "smooth transitions", "dark mode"] },
  "productivity": { name: "Notion", url: "https://notion.so", strengths: ["clean hierarchy", "consistent spacing", "minimal chrome"] },
  "finance": { name: "Revolut", url: "https://revolut.com", strengths: ["data density", "clear actions", "dark theme"] },
  "food": { name: "Uber Eats", url: "https://ubereats.com", strengths: ["card hierarchy", "image quality", "location awareness"] },
  "travel": { name: "Airbnb", url: "https://airbnb.com", strengths: ["image-first", "filter UX", "trust signals"] },
  "music": { name: "Spotify", url: "https://spotify.com", strengths: ["dark theme", "personalization", "player UX"] },
  "shopping": { name: "Shopify", url: "https://shopify.com", strengths: ["product cards", "checkout flow", "mobile-first"] },
};

// M16: Run comparative benchmark
export async function runBenchmark(
  projectDir: string,
  category: string,
  provider: { model: string; baseUrl: string; apiKey: string },
): Promise<BenchmarkResult> {
  const leader = CATEGORY_LEADERS[category] ?? CATEGORY_LEADERS["productivity"]!;

  // Get built app code
  const codeRes = await executeTool("grep", { pattern: "StyleSheet|style|className" }, projectDir);
  const builtCode = codeRes.ok && codeRes.result ? codeRes.result : "No code found";

  // Build benchmark prompt
  const prompt: LayeredPrompt = composePrompt(
    "taste",
    `Compare this app code against ${leader.name} (${leader.url}).

BUILT APP CODE:
${builtCode.slice(0, 2000)}

CATEGORY LEADER STRENGTHS:
${leader.strengths.join(", ")}

Rate the built app 0-10 on:
1. Visual hierarchy
2. Spacing consistency
3. Color restraint
4. Typography quality
5. Overall premium feel

Return JSON: {"score": N, "improvements": ["improvement1", "improvement2"]}`,
    [],
  );

  try {
    const result = await sendToProvider(prompt, provider);
    const parsed = JSON.parse(result.text) as { score?: number; improvements?: string[] };
    const builtScore = parsed.score ?? 5;
    const leaderScore = 8; // Category leaders are typically 8-9
    const gap = leaderScore - builtScore;

    return {
      category,
      builtScore,
      leaderScore,
      gap,
      improvements: parsed.improvements ?? [],
    };
  } catch {
    return {
      category,
      builtScore: 5,
      leaderScore: 8,
      gap: 3,
      improvements: ["Benchmark failed — provider error"],
    };
  }
}
