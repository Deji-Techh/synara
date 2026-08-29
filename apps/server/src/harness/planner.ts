// harness/planner.ts — M7 Planner: real NLP flow extraction from spec
// Breaks spec into vertical slices (UI+state+data+edge per slice)

export interface Slice {
  readonly id: string;
  readonly title: string;
  readonly spec: string;
  readonly priority: number;
  readonly flows: string[];
}

// M7: Extract flows from spec using keyword analysis (not just newlines)
function extractFlows(spec: string): string[] {
  const flows: string[] = [];
  const lower = spec.toLowerCase();
  const patterns: [RegExp, string][] = [
    [/login|sign\s*in|authenticate/i, "auth"],
    [/register|sign\s*up|create\s*account/i, "registration"],
    [/search|find|lookup|query/i, "search"],
    [/list|browse|catalog|explore/i, "listing"],
    [/detail|view|show|display/i, "detail"],
    [/edit|update|modify|change/i, "edit"],
    [/delete|remove|destroy/i, "delete"],
    [/profile|account|settings|preferences/i, "settings"],
    [/home|dashboard|main|overview/i, "home"],
    [/checkout|payment|pay|purchase/i, "payment"],
    [/notification|alert|message/i, "notification"],
    [/loading|skeleton|spinner/i, "loading"],
    [/error|fail|retry/i, "error"],
    [/empty|no.data|placeholder/i, "empty"],
    [/offline|network|connectivity/i, "offline"],
  ];
  for (const [re, flow] of patterns) {
    if (re.test(lower)) flows.push(flow);
  }
  return flows.length > 0 ? flows : ["general"];
}

// M7: Split spec into vertical slices (one complete flow per slice)
export function plannerSlice(spec: string): Slice[] {
  const flows = extractFlows(spec);
  const sentences = spec.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  const slices: Slice[] = [];

  // Group sentences by flow
  const flowGroups: Record<string, string[]> = {};
  for (const flow of flows) flowGroups[flow] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const flow of flows) {
      const keywords: Record<string, string[]> = {
        auth: ["login", "sign in", "password", "email", "authenticate"],
        registration: ["register", "sign up", "create account", "new user"],
        search: ["search", "find", "lookup", "query", "filter"],
        listing: ["list", "browse", "catalog", "explore", "items"],
        detail: ["detail", "view", "show", "display", "page"],
        edit: ["edit", "update", "modify", "change", "save"],
        delete: ["delete", "remove", "destroy", "confirm"],
        settings: ["profile", "account", "settings", "preferences", "theme"],
        home: ["home", "dashboard", "main", "overview", "landing"],
        payment: ["checkout", "payment", "pay", "purchase", "cart"],
        notification: ["notification", "alert", "message", "push"],
        loading: ["loading", "skeleton", "spinner", "progress"],
        error: ["error", "fail", "retry", "crash", "broken"],
        empty: ["empty", "no data", "placeholder", "nothing"],
        offline: ["offline", "network", "connectivity", "airplane"],
      };
      if (keywords[flow]?.some((k) => lower.includes(k))) {
        flowGroups[flow]?.push(sentence.trim());
      }
    }
  }

  // Create slices from flow groups
  let sliceIndex = 0;
  for (const [flow, sentences] of Object.entries(flowGroups)) {
    if (sentences.length === 0) continue;
    sliceIndex++;
    slices.push({
      id: `slice-${sliceIndex}`,
      title: `${flow.charAt(0).toUpperCase() + flow.slice(1)} flow`,
      spec: sentences.join(". "),
      priority: flow === "auth" ? 1 : flow === "home" ? 2 : 3,
      flows: [flow],
    });
  }

  // If no flows extracted, create a single slice from the full spec
  if (slices.length === 0) {
    slices.push({
      id: "slice-1",
      title: "Main flow",
      spec: spec.trim(),
      priority: 1,
      flows: ["general"],
    });
  }

  return slices.sort((a, b) => a.priority - b.priority);
}
