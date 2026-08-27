import React from "react";

interface CaideCommandButtonProps {
  type?: "rebuild" | "restart" | "refresh" | string | undefined;
  onClick?: (() => void) | undefined;
}

const COMMAND_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  rebuild: {
    label: "Rebuild App",
    icon: "⚡",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20",
  },
  restart: {
    label: "Hot Restart",
    icon: "↻",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20",
  },
  refresh: {
    label: "Refresh Preview",
    icon: "⟳",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/30 hover:bg-purple-500/20",
  },
};

export const CaideCommandButton: React.FC<CaideCommandButtonProps> = ({
  type = "restart",
  onClick,
}) => {
  const meta = COMMAND_LABELS[type] || {
    label: `Run ${type}`,
    icon: "▶",
    color: "bg-muted text-foreground border-border hover:bg-muted/80",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`my-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-2xs transition-all cursor-pointer select-none active:scale-95 ${meta.color}`}
    >
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </button>
  );
};
