import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import ChatMarkdown from "../ChatMarkdown";

export function ChatModeBadge({ mode }: { mode: string }) {
  const label =
    mode === "plan"
      ? "Plan · Read-only"
      : mode === "ask"
        ? "Ask · Explain"
        : mode === "local-agent"
          ? "Agent"
          : "Build";
  const variant = mode === "plan" ? "secondary" : mode === "ask" ? "outline" : "default";
  const cls =
    mode === "plan"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : mode === "ask"
        ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200"
        : undefined;
  return (
    <Badge variant={variant as any} className={cn("shrink-0", cls)}>
      {label}
    </Badge>
  );
}

export function PlanPreviewPane({
  planMarkdown,
  isStreaming,
  cwd,
}: {
  planMarkdown: string;
  isStreaming: boolean;
  cwd?: string;
}) {
  if (!planMarkdown) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950">
        <span className="text-xs font-medium tracking-wide text-amber-800 dark:text-amber-200">
          Plan preview — {isStreaming ? "streaming…" : "ready"}
        </span>
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
        >
          Read-only
        </Badge>
      </div>
      <div className="max-h-[42vh] overflow-auto p-3">
        <ChatMarkdown text={planMarkdown} cwd={cwd} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
