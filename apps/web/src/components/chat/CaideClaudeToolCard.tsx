// FILE: CaideClaudeToolCard.tsx
// Purpose: Interactive tool execution card for chat messages.
// Layer: Web UI chat component
// Styling: Dyad x Caide card language (accent rail, medallion icon, kind
// badge, state pill, lazy output) on Caide-final theme tokens — every accent
// resolves to a theme variable so the theme changer applies everywhere.

import React, { useState } from "react";
import {
  IconTerminal2,
  IconFileCode,
  IconFileText,
  IconFolder,
  IconPackage,
  IconSearch,
  IconTool,
  IconHammer,
  IconCamera,
  IconWorld,
  IconPalette,
  IconTrash,
  IconPencil,
} from "@tabler/icons-react";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import {
  CaideCard,
  CaideCardHeader,
  CaideBadge,
  CaideLazyContent,
  CaideStateIndicator,
  CaideCopyButton,
  type CardAccent,
  type ToolCardState,
} from "./CaideCardPrimitives";

export type ToolCardStatus =
  | "running"
  | "pending"
  | "complete"
  | "completed"
  | "error"
  | "failed"
  | "aborted"
  | "started";

export interface CaideClaudeToolCardProps {
  toolName: string;
  attributes?: Record<string, string>;
  content?: string;
  state?: ToolCardStatus | string;
}

interface ToolMeta {
  verb: string;
  target?: string;
  icon: React.ReactNode;
  accent: CardAccent;
}

function getToolMeta(name: string, attrs: Record<string, string>): ToolMeta {
  const clean = name.toLowerCase().replace(/^(?:caide|dyad)[-_]/, "").replace(/[-_]/g, " ");

  if (clean.includes("read file") || clean === "read") {
    return { verb: "Read", target: attrs.path || attrs.file || "", icon: <IconFileText size={14} />, accent: "info" };
  }
  if (clean.includes("search replace") || clean.includes("multi replace") || clean.includes("edit")) {
    return { verb: "Edit", target: attrs.path || attrs.file || "", icon: <IconPencil size={14} />, accent: "success" };
  }
  if (clean.includes("write file") || clean === "write") {
    return { verb: "Write", target: attrs.path || attrs.file || "", icon: <IconFileCode size={14} />, accent: "success" };
  }
  if (clean.includes("delete")) {
    return { verb: "Delete", target: attrs.path || attrs.file || "", icon: <IconTrash size={14} />, accent: "danger" };
  }
  if (clean.includes("rename") || clean.includes("copy file") || clean.includes("copy")) {
    return { verb: clean.includes("rename") ? "Rename" : "Copy", target: attrs.path || attrs.file || "", icon: <IconFileCode size={14} />, accent: "success" };
  }
  if (clean.includes("list dir") || clean.includes("list files") || clean === "list") {
    return { verb: "List", target: attrs.path || ".", icon: <IconFolder size={14} />, accent: "info" };
  }
  if (clean.includes("run command") || clean.includes("command") || clean === "exec") {
    return { verb: "Bash", target: attrs.command || attrs.cmd || "", icon: <IconTerminal2 size={14} />, accent: "warning" };
  }
  if (clean.includes("install") || clean.includes("dependency") || clean.includes("package")) {
    return { verb: "Install", target: attrs.name || attrs.packages || attrs.package || "", icon: <IconPackage size={14} />, accent: "success" };
  }
  if (clean.includes("build") || clean.includes("lint") || clean.includes("test") || clean.includes("typecheck") || clean.includes("type check")) {
    return {
      verb: clean.includes("lint") ? "Lint" : clean.includes("test") ? "Test" : "Build",
      target: attrs.framework || attrs.target || "Project",
      icon: <IconHammer size={14} />,
      accent: "warning",
    };
  }
  if (clean.includes("search") || clean.includes("grep") || clean.includes("code search") || clean.includes("explore")) {
    return { verb: "Search", target: attrs.query || attrs.pattern || attrs.path || "", icon: <IconSearch size={14} />, accent: "info" };
  }
  if (clean.includes("screenshot")) {
    return { verb: "Screenshot", target: attrs.label || "Viewport", icon: <IconCamera size={14} />, accent: "info" };
  }
  if (clean.includes("preview") || clean.includes("url") || clean.includes("fetch") || clean.includes("crawl")) {
    return { verb: "Network", target: attrs.url || "Preview Server", icon: <IconWorld size={14} />, accent: "info" };
  }
  if (clean.includes("token") || clean.includes("design") || clean.includes("spec")) {
    return { verb: "Tokens", target: attrs.section || "Design Tokens", icon: <IconPalette size={14} />, accent: "info" };
  }

  return {
    verb: clean.charAt(0).toUpperCase() + clean.slice(1),
    target: attrs.path || attrs.target || attrs.name || "",
    icon: <IconTool size={14} />,
    accent: "neutral",
  };
}

function normalizeState(state: string): ToolCardState {
  if (state === "running" || state === "pending" || state === "started") return "pending";
  if (state === "error" || state === "failed") return "error";
  if (state === "aborted") return "aborted";
  return "complete";
}

function formatContent(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

export const CaideClaudeToolCard: React.FC<CaideClaudeToolCardProps> = ({
  toolName,
  attributes = {},
  content = "",
  state = "complete",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const cardState = normalizeState(state);
  const meta = getToolMeta(toolName, attributes);
  const formattedContent = formatContent(content);

  return (
    <div className="my-0.5 select-none text-left">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group inline-flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/30 transition-colors duration-150 cursor-pointer text-left text-[12px]"
      >
        <span className="text-muted-foreground/80 font-normal">{meta.verb}</span>
        {meta.target && (
          <code className="font-mono text-[11px] text-foreground/90 group-hover:text-foreground">
            {meta.target}
          </code>
        )}
        {cardState === "pending" && (
          <span className="size-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
        )}
        <DisclosureChevron
          open={isExpanded}
          className="size-2.5 text-muted-foreground/40 group-hover:text-foreground/60 transition-transform"
        />
      </button>

      <DisclosureRegion open={isExpanded}>
          {formattedContent ? (
            <div className="overflow-hidden rounded-lg border border-border/40 bg-black/60 dark:bg-black/80 my-1">
              <div className="flex items-center justify-between border-b border-border/30 bg-muted/20 px-3 py-1 text-[10.5px] text-muted-foreground/80 font-mono">
                <span>{meta.verb === "Bash" ? "Terminal output" : "Output"}</span>
                <CaideCopyButton text={content} />
              </div>
              <pre className="max-h-72 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground/90 select-text">
                {formattedContent}
              </pre>
            </div>
          ) : (
            <div className="py-1.5 text-left text-[11px] text-muted-foreground/60 italic px-2">
              No output recorded
            </div>
          )}
      </DisclosureRegion>
    </div>
  );
};
