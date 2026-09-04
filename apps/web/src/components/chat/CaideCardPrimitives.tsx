// FILE: CaideCardPrimitives.tsx
// Purpose: Theme-aware primitives for chat tool/action cards.
// Layer: Web UI chat component
// Styling: Dyad x Caide card language (accent rail, tinted icon medallion,
// ring badge, state pills, lazy-expanded content) rebuilt on Caide-final
// theme tokens — accents resolve to `--info/--success/--warning/--destructive`
// so every palette + light/dark mode from the theme changer applies.
// Motion stays on the shared disclosure system (DisclosureRegion).

import React, { useEffect, useState, type ReactNode } from "react";
import { IconLoader2, IconCheck, IconX, IconBan } from "@tabler/icons-react";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";

export type ToolCardState = "pending" | "complete" | "error" | "aborted";

/** Semantic accent — resolves to a theme CSS variable, never a fixed hue. */
export type CardAccent = "info" | "success" | "warning" | "danger" | "neutral";

export const ACCENT_VAR: Record<CardAccent, string> = {
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  neutral: "var(--muted-foreground)",
};

function tint(variable: string, pct: number): string {
  return `color-mix(in srgb, ${variable} ${pct}%, transparent)`;
}

interface CaideCardProps {
  children: ReactNode;
  state?: ToolCardState;
  accent?: CardAccent;
  onClick?: () => void;
  isExpanded?: boolean;
  className?: string;
}

/**
 * Premium container for chat action cards. Shows a 3px accent rail while
 * pending (or in the error color on failure). Keyboard-operable when
 * clickable, per the Dyad card pattern.
 */
export const CaideCard: React.FC<CaideCardProps> = ({
  children,
  state,
  accent = "neutral",
  onClick,
  isExpanded,
  className = "",
}) => {
  const railVar =
    state === "error" ? ACCENT_VAR.danger : state === "pending" ? ACCENT_VAR[accent] : null;

  return (
    <div
      data-caide-card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-expanded={onClick && isExpanded !== undefined ? isExpanded : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`group my-0.5 min-w-0 rounded-md transition-colors duration-150 ${
        onClick ? "cursor-pointer hover:bg-muted/35" : ""
      } ${className}`}
      style={railVar ? { borderLeft: `2px solid ${railVar}`, paddingLeft: "6px" } : undefined}
    >
      {children}
    </div>
  );
};

interface CaideCardHeaderProps {
  children: ReactNode;
  icon?: ReactNode;
  accent?: CardAccent;
}

/** Header row with a subtle icon and clean typography. */
export const CaideCardHeader: React.FC<CaideCardHeaderProps> = ({
  children,
  icon,
  accent = "neutral",
}) => {
  const v = ACCENT_VAR[accent];
  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2 px-1.5 py-0.5 text-xs text-muted-foreground select-none">
      {icon && (
        <div
          className="flex size-4 shrink-0 items-center justify-center opacity-75 transition-opacity group-hover:opacity-100"
          style={{ color: v }}
        >
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
};

/** Minimal text badge for tool verbs. */
export const CaideBadge: React.FC<{ children: ReactNode; accent?: CardAccent }> = ({
  children,
}) => {
  return (
    <span className="shrink-0 font-medium text-foreground/90">
      {children}
    </span>
  );
};

export const CaideCardContent: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = "",
}) => {
  return (
    <div className={`mt-1 text-xs ${className}`}>
      {children}
    </div>
  );
};

/**
 * Expandable content with lazy mount: heavy output only renders after the
 * first expansion (Dyad perf pattern), animated via shared disclosure motion.
 */
export const CaideLazyContent: React.FC<{ open: boolean; children: ReactNode }> = ({
  open,
  children,
}) => {
  const [hasOpened, setHasOpened] = useState(open);
  useEffect(() => {
    if (open && !hasOpened) setHasOpened(true);
  }, [open, hasOpened]);

  return (
    <DisclosureRegion open={open}>
      <div className="mt-1 px-1 pb-1">{hasOpened ? children : null}</div>
    </DisclosureRegion>
  );
};

export const CaideStateIndicator: React.FC<{
  state: ToolCardState;
  pendingLabel?: string;
  abortedLabel?: string;
}> = ({ state, pendingLabel = "Running", abortedLabel = "Stopped" }) => {
  if (state === "pending") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium opacity-80"
        style={{ color: ACCENT_VAR.info }}
      >
        <IconLoader2 size={11} className="animate-spin" />
        {pendingLabel}
      </span>
    );
  }
  if (state === "complete") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground/50 transition-opacity group-hover:text-muted-foreground"
      >
        <IconCheck size={11} strokeWidth={2} className="opacity-70" />
        Done
      </span>
    );
  }
  if (state === "aborted") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium"
        style={{ color: ACCENT_VAR.warning }}
      >
        <IconBan size={11} />
        {abortedLabel}
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium"
      style={{ color: ACCENT_VAR.danger }}
    >
      <IconX size={11} strokeWidth={2} />
      Failed
    </span>
  );
};

/** Monospace file-path line under the header. */
export const CaideFilePath: React.FC<{ path: string }> = ({ path }) => {
  if (!path) return null;
  return (
    <div className="px-3 pb-1">
      <span className="block truncate font-mono text-[11px] text-muted-foreground">{path}</span>
    </div>
  );
};

/** Muted description line under the header. */
export const CaideDescription: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <div className="px-3 pb-2 text-[11px] text-muted-foreground">{children}</div>;
};

/** Copy-to-clipboard button for output panes. */
export const CaideCopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <>
          <IconCheck size={11} style={{ color: ACCENT_VAR.success }} />
          <span style={{ color: ACCENT_VAR.success }}>Copied</span>
        </>
      ) : (
        <>Copy</>
      )}
    </button>
  );
};
