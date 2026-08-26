import React, { type ReactNode } from "react";

export type ToolCardState = "pending" | "complete" | "error" | "aborted";

interface CaideCardProps {
  children: ReactNode;
  state?: ToolCardState;
  accentColor?: "blue" | "green" | "purple" | "amber" | "rose" | "gray";
  onClick?: () => void;
  isExpanded?: boolean;
  className?: string;
}

const ACCENT_BORDER_MAP = {
  blue: "border-blue-500/30 hover:border-blue-500/50 bg-blue-500/[0.02]",
  green: "border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/[0.02]",
  purple: "border-purple-500/30 hover:border-purple-500/50 bg-purple-500/[0.02]",
  amber: "border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.02]",
  rose: "border-rose-500/30 hover:border-rose-500/50 bg-rose-500/[0.02]",
  gray: "border-border/60 hover:border-border bg-card/40",
};

export const CaideCard: React.FC<CaideCardProps> = ({
  children,
  accentColor = "gray",
  onClick,
  isExpanded,
  className = "",
}) => {
  return (
    <div
      data-caide-card
      onClick={onClick}
      className={`my-2 rounded-xl border transition-all duration-200 overflow-hidden shadow-xs ${
        ACCENT_BORDER_MAP[accentColor]
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

interface CaideCardHeaderProps {
  children: ReactNode;
  icon?: ReactNode;
  accentColor?: keyof typeof ACCENT_BORDER_MAP;
}

export const CaideCardHeader: React.FC<CaideCardHeaderProps> = ({ children, icon }) => {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-foreground/90 font-medium select-none">
      {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
      <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
    </div>
  );
};

export const CaideCardContent: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = "",
}) => {
  return (
    <div className={`px-3.5 pb-3 pt-1 border-t border-border/40 text-xs ${className}`}>
      {children}
    </div>
  );
};

export const CaideStateIndicator: React.FC<{
  state: ToolCardState;
  pendingLabel?: string;
  abortedLabel?: string;
}> = ({ state, pendingLabel = "Processing...", abortedLabel = "Interrupted" }) => {
  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium text-blue-500 bg-blue-500/10 rounded-full animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        {pendingLabel}
      </span>
    );
  }
  if (state === "aborted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium text-amber-500 bg-amber-500/10 rounded-full">
        {abortedLabel}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium text-rose-500 bg-rose-500/10 rounded-full">
        Error
      </span>
    );
  }
  return null;
};
