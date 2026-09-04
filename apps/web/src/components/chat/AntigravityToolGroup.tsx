// FILE: AntigravityToolGroup.tsx
// Purpose: Sleek grouped tool calling and thought presentation matching Antigravity & T3 Code
// Exports: AntigravityToolGroup, AntigravityToolItem

import React, { useState, useMemo } from "react";
import { cn } from "~/lib/utils";
import { DisclosureChevron } from "../ui/DisclosureChevron";
import { DisclosureRegion } from "../ui/DisclosureRegion";
import { CopyIcon, CheckIcon } from "~/lib/icons";
import ReactMarkdown from "react-markdown";

export interface AntigravityToolItem {
  id: string;
  type: "command" | "read" | "edit" | "search" | "think" | "other";
  verb: string;
  target?: string;
  lineRange?: string;
  resultBadge?: string;
  durationSec?: number;
  content?: string;
  state?: "complete" | "running" | "error";
  isStreaming?: boolean;
}

export interface AntigravityToolGroupProps {
  items: AntigravityToolItem[];
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  fontSizePx?: number;
}

export const AntigravityToolGroup: React.FC<AntigravityToolGroupProps> = ({
  items,
  isStreaming = false,
  defaultExpanded = false,
  fontSizePx = 13,
}) => {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Group summary label
  const { summaryLabel, activeLabel } = useMemo(() => {
    if (items.length === 0) return { summaryLabel: "Ran operations", activeLabel: "Running operations" };

    const commands = items.filter((it) => it.type === "command");
    const searches = items.filter((it) => it.type === "search");
    const reads = items.filter((it) => it.type === "read" || it.type === "edit");
    const filesCount = reads.length;

    // Single command
    if (items.length === 1 && commands.length === 1 && commands[0].target) {
      const cmd = commands[0].target.length > 55 ? commands[0].target.slice(0, 52) + "..." : commands[0].target;
      return {
        summaryLabel: `Ran ${cmd}`,
        activeLabel: `Running ${cmd}`,
      };
    }

    // Only commands
    if (commands.length === items.length) {
      return {
        summaryLabel: `Ran ${commands.length} ${commands.length === 1 ? "command" : "commands"}`,
        activeLabel: `Running ${commands.length} ${commands.length === 1 ? "command" : "commands"}`,
      };
    }

    // Files + searches combination
    if (filesCount > 0 && searches.length > 0 && commands.length === 0) {
      return {
        summaryLabel: `Explored ${filesCount} ${filesCount === 1 ? "file" : "files"}, ${searches.length} ${searches.length === 1 ? "search" : "searches"}`,
        activeLabel: `Exploring ${filesCount} ${filesCount === 1 ? "file" : "files"}, ${searches.length} ${searches.length === 1 ? "search" : "searches"}`,
      };
    }

    // Only files
    if (filesCount > 0 && searches.length === 0 && commands.length === 0) {
      return {
        summaryLabel: `Explored ${filesCount} ${filesCount === 1 ? "file" : "files"}`,
        activeLabel: `Exploring ${filesCount} ${filesCount === 1 ? "file" : "files"}`,
      };
    }

    // Only searches
    if (searches.length > 0 && filesCount === 0 && commands.length === 0) {
      return {
        summaryLabel: `Searched ${searches.length} ${searches.length === 1 ? "query" : "queries"}`,
        activeLabel: `Searching ${searches.length} ${searches.length === 1 ? "query" : "queries"}`,
      };
    }

    // Mixed
    const parts: string[] = [];
    if (commands.length > 0) parts.push(`Ran ${commands.length} ${commands.length === 1 ? "command" : "commands"}`);
    if (filesCount > 0) parts.push(`explored ${filesCount} ${filesCount === 1 ? "file" : "files"}`);
    if (searches.length > 0) parts.push(`${searches.length} ${searches.length === 1 ? "search" : "searches"}`);

    const label = parts.join(", ") || `${items.length} tool calls`;
    return {
      summaryLabel: label,
      activeLabel: label,
    };
  }, [items]);

  const displayHeader = isOpen ? activeLabel : summaryLabel;

  return (
    <div className="my-1 text-left font-sans select-none" style={{ fontSize: `${fontSizePx}px` }}>
      {/* Group header button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center gap-1.5 py-1 px-1 -mx-1 rounded-md text-foreground/85 hover:text-foreground hover:bg-muted/30 transition-colors duration-150 cursor-pointer text-left"
      >
        <span className="font-medium tracking-tight text-[12.5px] text-foreground/90 group-hover:text-foreground">
          {displayHeader}
        </span>
        <DisclosureChevron
          open={isOpen}
          className="size-3 text-muted-foreground/60 transition-transform duration-200 group-hover:text-foreground/80"
        />
      </button>

      {/* Expanded list of tool rows */}
      <DisclosureRegion open={isOpen}>
        <div className="flex flex-col gap-1 pl-1 pt-1 pb-1">
          {items.map((item) => (
            <AntigravityItemRow
              key={item.id}
              item={item}
              isExpanded={Boolean(expandedItems[item.id])}
              onToggle={(e) => toggleItem(item.id, e)}
            />
          ))}
        </div>
      </DisclosureRegion>
    </div>
  );
};

// Single row item inside the group
function AntigravityItemRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: AntigravityToolItem;
  isExpanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.content) return;
    navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (item.type === "think") {
    const durationLabel = item.durationSec ? `Thought for ${item.durationSec}s` : "Thought";
    return (
      <div className="flex flex-col py-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="group inline-flex items-center gap-1.5 text-left text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer py-0.5"
        >
          <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground/90">
            {durationLabel}
          </span>
          <DisclosureChevron
            open={isExpanded}
            className="size-2.5 text-muted-foreground/50 transition-transform group-hover:text-foreground/70"
          />
        </button>

        <DisclosureRegion open={isExpanded}>
          <div className="relative mt-1 mb-1 pl-3 border-l-2 border-border/50 text-[12px] text-muted-foreground/90 leading-relaxed font-sans">
            {item.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                <ReactMarkdown>{item.content}</ReactMarkdown>
              </div>
            ) : (
              <span className="italic text-muted-foreground/60">Thinking...</span>
            )}
            {item.content && (
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-0 right-1 p-1 text-muted-foreground/40 hover:text-muted-foreground rounded transition-colors"
                title="Copy thought"
              >
                {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
              </button>
            )}
          </div>
        </DisclosureRegion>
      </div>
    );
  }

  // File Read / Analyze
  if (item.type === "read" || item.type === "edit") {
    const filename = item.target?.split("/").pop() || item.target || "file";
    return (
      <div className="flex flex-col py-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="group inline-flex items-center gap-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
        >
          <span className="text-muted-foreground/80 font-normal">{item.verb}</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11.5px] font-medium text-foreground/90 group-hover:text-foreground">
            <span className="size-1.5 rounded-full bg-blue-500/70 inline-block" />
            <span>{filename}</span>
          </span>
          {item.lineRange && (
            <span className="rounded bg-muted/60 px-1 py-0.2 font-mono text-[10.5px] text-muted-foreground/80">
              {item.lineRange}
            </span>
          )}
          {item.content && (
            <DisclosureChevron
              open={isExpanded}
              className="size-2.5 text-muted-foreground/40 transition-transform group-hover:text-foreground/60 ml-0.5"
            />
          )}
        </button>

        {item.content && (
          <DisclosureRegion open={isExpanded}>
            <div className="relative mt-1 mb-1 rounded-md border border-border/40 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-foreground/85">
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-1.5 right-1.5 p-1 bg-background/60 hover:bg-background rounded border border-border/40 text-muted-foreground transition-colors"
                title="Copy content"
              >
                {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
              </button>
              {item.content}
            </div>
          </DisclosureRegion>
        )}
      </div>
    );
  }

  // Search
  if (item.type === "search") {
    return (
      <div className="flex flex-col py-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="group inline-flex items-center gap-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
        >
          <span className="text-muted-foreground/80 font-normal">{item.verb}</span>
          {item.target && (
            <span className="font-mono text-[11.5px] text-foreground/90 group-hover:text-foreground">
              {item.target}
            </span>
          )}
          {item.resultBadge && (
            <span className="rounded bg-muted/60 px-1.5 py-0.2 font-mono text-[10.5px] text-muted-foreground/80">
              {item.resultBadge}
            </span>
          )}
          {item.content && (
            <DisclosureChevron
              open={isExpanded}
              className="size-2.5 text-muted-foreground/40 transition-transform group-hover:text-foreground/60 ml-0.5"
            />
          )}
        </button>

        {item.content && (
          <DisclosureRegion open={isExpanded}>
            <div className="relative mt-1 mb-1 rounded-md border border-border/40 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-foreground/85">
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-1.5 right-1.5 p-1 bg-background/60 hover:bg-background rounded border border-border/40 text-muted-foreground transition-colors"
                title="Copy results"
              >
                {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
              </button>
              {item.content}
            </div>
          </DisclosureRegion>
        )}
      </div>
    );
  }

  // Command / Bash
  const commandSnippet = item.target || "command";
  return (
    <div className="flex flex-col py-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="group inline-flex items-center gap-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
      >
        <span className="text-muted-foreground/80 font-normal">{item.verb}</span>
        <code className="rounded bg-muted/50 px-1 py-0.2 font-mono text-[11px] text-foreground/90 group-hover:text-foreground">
          {commandSnippet}
        </code>
        {item.content && (
          <DisclosureChevron
            open={isExpanded}
            className="size-2.5 text-muted-foreground/40 transition-transform group-hover:text-foreground/60 ml-0.5"
          />
        )}
      </button>

      {item.content && (
        <DisclosureRegion open={isExpanded}>
          <div className="relative mt-1 mb-1 rounded-md border border-border/40 bg-black/70 p-2 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-foreground/90">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-1.5 right-1.5 p-1 bg-background/60 hover:bg-background rounded border border-border/40 text-muted-foreground transition-colors"
              title="Copy output"
            >
              {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
            </button>
            {item.content}
          </div>
        </DisclosureRegion>
      )}
    </div>
  );
}
