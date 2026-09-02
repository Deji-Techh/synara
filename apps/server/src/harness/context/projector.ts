import type { ContextMessage } from "./memory.ts";

export type ProjectionMode =
  | "normal"
  | "media-degraded"
  | "media-stripped"
  | "strict"
  | "emergency";

export class Projector {
  /**
   * Projects context messages through the degradation ladder.
   */
  static project(
    messages: readonly ContextMessage[],
    mode: ProjectionMode = "normal",
  ): ContextMessage[] {
    switch (mode) {
      case "normal":
        return [...messages];

      case "media-degraded":
        return messages.map((msg) => {
          if (!msg.attachments || msg.attachments.length === 0) return msg;
          const nonImages = msg.attachments.filter((a) => a.type !== "image");
          const imagePlaceholders = msg.attachments
            .filter((a) => a.type === "image")
            .map((a) => `[Image Attachment: ${a.name ?? "screenshot"}]`)
            .join("\n");

          return {
            ...msg,
            content: imagePlaceholders ? `${msg.content}\n${imagePlaceholders}` : msg.content,
            attachments: nonImages.length > 0 ? nonImages : undefined,
          };
        });

      case "media-stripped":
        return messages.map((msg) => ({
          ...msg,
          attachments: undefined,
        }));

      case "strict":
        return messages.map((msg) => {
          let content = msg.content;
          // Truncate verbose tool result outputs > 2000 chars
          if (msg.role === "tool" && content.length > 2000) {
            content = `${content.slice(0, 1000)}\n\n[... Truncated ${content.length - 2000} chars for context limits ...]\n\n${content.slice(-1000)}`;
          }

          return {
            ...msg,
            content,
            attachments: undefined,
          };
        });

      case "emergency": {
        // Retain system messages, summary messages, and only last 2 turns
        const systemAndSummaries = messages.filter((m) => m.role === "system" || m.isSummary);
        const nonSystem = messages.filter((m) => m.role !== "system" && !m.isSummary);
        const recentTurns = nonSystem.slice(-4); // last 2 user-assistant pairs

        const combined = [...systemAndSummaries, ...recentTurns];
        return combined.map((msg) => ({
          ...msg,
          attachments: undefined,
        }));
      }

      default:
        return [...messages];
    }
  }

  /**
   * Automatically picks the appropriate projection ladder mode based on context budget usage.
   */
  static selectModeForBudget(usagePercent: number): ProjectionMode {
    if (usagePercent < 70) return "normal";
    if (usagePercent < 85) return "media-degraded";
    if (usagePercent < 95) return "strict";
    return "emergency";
  }
}
