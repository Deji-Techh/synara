// FILE: CaideClaudeToolCard.tsx
// Purpose: Claude Code style interactive tool execution card for chat messages.
// Layer: Web UI chat component
// Features: Expandable disclosure, status indicators, tool-specific glyphs, syntax-friendly outputs.

import React, { useState } from "react";
import {
  IconTerminal2,
  IconFileCode,
  IconFileText,
  IconFolder,
  IconPackage,
  IconSearch,
  IconWrench,
  IconCheck,
  IconX,
  IconCopy,
  IconHammer,
  IconCamera,
  IconWorld,
  IconPalette,
} from "@tabler/icons-react";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";

export type ToolCardStatus = "running" | "pending" | "complete" | "completed" | "error" | "failed";

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
  accent: "sky" | "emerald" | "amber" | "purple" | "neutral";
}

function getToolMeta(name: string, attrs: Record<string, string>): ToolMeta {
  const clean = name.toLowerCase().replace(/^(?:caide|dyad)[-_]/, "").replace(/[-_]/g, " ");

  if (clean.includes("read file") || clean === "read") {
    return {
      verb: "Read",
      target: attrs.path || attrs.file || "",
      icon: <IconFileText size={14} className="text-sky-500 dark:text-sky-400" />,
      accent: "sky",
    };
  }
  if (clean.includes("write file") || clean === "write") {
    return {
      verb: "Write",
      target: attrs.path || attrs.file || "",
      icon: <IconFileCode size={14} className="text-emerald-500 dark:text-emerald-400" />,
      accent: "emerald",
    };
  }
  if (clean.includes("list dir") || clean.includes("list files") || clean === "list") {
    return {
      verb: "List",
      target: attrs.path || ".",
      icon: <IconFolder size={14} className="text-amber-500 dark:text-amber-400" />,
      accent: "amber",
    };
  }
  if (clean.includes("run command") || clean.includes("command") || clean === "exec") {
    return {
      verb: "Bash",
      target: attrs.command || attrs.cmd || "",
      icon: <IconTerminal2 size={14} className="text-purple-500 dark:text-purple-400" />,
      accent: "purple",
    };
  }
  if (clean.includes("install") || clean.includes("dependency") || clean.includes("package")) {
    return {
      verb: "Install",
      target: attrs.name || attrs.packages || attrs.package || "",
      icon: <IconPackage size={14} className="text-sky-500 dark:text-sky-400" />,
      accent: "sky",
    };
  }
  if (clean.includes("build") || clean.includes("lint")) {
    return {
      verb: clean.includes("lint") ? "Lint" : "Build",
      target: attrs.framework || attrs.target || "Project",
      icon: <IconHammer size={14} className="text-amber-500 dark:text-amber-400" />,
      accent: "amber",
    };
  }
  if (clean.includes("search") || clean.includes("grep")) {
    return {
      verb: "Search",
      target: attrs.query || attrs.pattern || "",
      icon: <IconSearch size={14} className="text-sky-500 dark:text-sky-400" />,
      accent: "sky",
    };
  }
  if (clean.includes("screenshot")) {
    return {
      verb: "Screenshot",
      target: attrs.label || "Viewport",
      icon: <IconCamera size={14} className="text-purple-500 dark:text-purple-400" />,
      accent: "purple",
    };
  }
  if (clean.includes("preview") || clean.includes("url") || clean.includes("fetch")) {
    return {
      verb: "Network",
      target: attrs.url || "Preview Server",
      icon: <IconWorld size={14} className="text-sky-500 dark:text-sky-400" />,
      accent: "sky",
    };
  }
  if (clean.includes("token") || clean.includes("design") || clean.includes("spec")) {
    return {
      verb: "Tokens",
      target: attrs.section || "Design Tokens",
      icon: <IconPalette size={14} className="text-emerald-500 dark:text-emerald-400" />,
      accent: "emerald",
    };
  }

  return {
    verb: clean.charAt(0).toUpperCase() + clean.slice(1),
    target: attrs.path || attrs.target || attrs.name || "",
    icon: <IconWrench size={14} className="text-muted-foreground" />,
    accent: "neutral",
  };
}

function formatContent(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
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
  const [copied, setCopied] = useState(false);

  const normalizedState =
    state === "running" || state === "pending" || state === "started"
      ? "running"
      : state === "error" || state === "failed"
        ? "error"
        : "complete";

  const meta = getToolMeta(toolName, attributes);
  const formattedContent = formatContent(content);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-2 select-none">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border transition-all duration-150 cursor-pointer ${
          isExpanded
            ? "bg-muted/50 dark:bg-card/70 border-border shadow-xs"
            : "bg-muted/20 dark:bg-card/40 hover:bg-muted/40 dark:hover:bg-card/60 border-border/50 hover:border-border"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-muted/60 dark:bg-muted/40 border border-border/40">
            {meta.icon}
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
            <span className="text-[12px] font-semibold text-foreground tracking-tight">
              {meta.verb}
            </span>

            {meta.target && (
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted/80 dark:bg-muted/50 text-foreground/90 border border-border/40 truncate max-w-[320px] sm:max-w-[420px]">
                {meta.target}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {normalizedState === "running" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-sky-500 bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/20 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              Running
            </span>
          )}
          {normalizedState === "complete" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20">
              <IconCheck size={11} strokeWidth={2.5} />
              Done
            </span>
          )}
          {normalizedState === "error" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20">
              <IconX size={11} strokeWidth={2.5} />
              Failed
            </span>
          )}

          <DisclosureChevron open={isExpanded} className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
        </div>
      </div>

      <DisclosureRegion open={isExpanded}>
        <div className="mt-1.5 pt-1 px-1">
          {formattedContent ? (
            <div className="relative rounded-lg border border-border/50 bg-muted/30 dark:bg-black/30 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/40 dark:bg-card/20 text-[10.5px] text-muted-foreground">
                <span className="font-medium">Output</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted dark:hover:bg-card/50 text-foreground/80 hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <>
                      <IconCheck size={11} className="text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <IconCopy size={11} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono leading-relaxed text-foreground/90 max-h-72 overflow-y-auto whitespace-pre-wrap break-all select-text">
                {formattedContent}
              </pre>
            </div>
          ) : (
            <div className="py-2 text-center text-[11px] text-muted-foreground italic">
              No output recorded
            </div>
          )}
        </div>
      </DisclosureRegion>
    </div>
  );
};
