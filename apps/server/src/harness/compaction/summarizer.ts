import type { ContextMessage } from "../context/memory.ts";
import type { SpecDoc } from "../planner/specValidator.ts";

export interface CompactionSummary {
  builtSummary: string;
  pendingSlices: string[];
  keyDecisions: string[];
  artifactList: string[];
  timestamp: number;
}

export interface SummarizerAdapter {
  summarize: (text: string) => Promise<string>;
}

export function formatSummaryMessage(summary: CompactionSummary): string {
  return [
    `## Rolling Compaction Summary (Proactive @70% Context Gate)`,
    `**What has been built:** ${summary.builtSummary}`,
    `**Artifacts created:** ${summary.artifactList.join(", ") || "None"}`,
    `**Key Decisions:**\n${summary.keyDecisions.map((d) => `- ${d}`).join("\n") || "- Adhered to .caide/design-spec.json"}`,
    `**Pending Slices:**\n${summary.pendingSlices.map((s) => `- ${s}`).join("\n") || "- None"}`,
  ].join("\n\n");
}

export async function summarizeHistory(
  messages: readonly ContextMessage[],
  spec?: SpecDoc,
  adapter?: SummarizerAdapter,
): Promise<CompactionSummary> {
  const artifacts = new Set<string>();
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolName === "write_file") {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.path) artifacts.add(parsed.path);
      } catch {
        // ignore
      }
    }
    if (msg.role === "tool" && msg.toolName === "log_decision") {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.decision) decisions.push(parsed.decision);
      } catch {
        // ignore
      }
    }
  }

  let builtSummary = "Completed initial setup, scaffold, and slice component implementation.";
  if (adapter) {
    const rawConversation = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    try {
      builtSummary = await adapter.summarize(rawConversation);
    } catch {
      // fallback
    }
  }

  const pendingSlices = spec ? spec.slices.map((s) => s.name) : ["Next feature slice"];

  return {
    builtSummary,
    pendingSlices,
    keyDecisions: decisions.length > 0 ? decisions : ["Strict adherence to .caide/design-spec.json tokens"],
    artifactList: Array.from(artifacts),
    timestamp: Date.now(),
  };
}
