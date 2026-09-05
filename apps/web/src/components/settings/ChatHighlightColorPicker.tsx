import { cn } from "~/lib/utils";
import { CHAT_HIGHLIGHT_COLOR_OPTIONS } from "~/lib/chatTypography";
import type { ChatHighlightColor } from "~/appSettings";

export function ChatHighlightColorPicker(props: {
  value: ChatHighlightColor;
  onValueChange: (value: ChatHighlightColor) => void;
  ariaLabel: string;
}) {
  const { value, onValueChange, ariaLabel } = props;

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {CHAT_HIGHLIGHT_COLOR_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            className={cn(
              "group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "border-foreground bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/20"
                : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
            onClick={() => onValueChange(option.value)}
          >
            <span
              aria-hidden="true"
              className={cn("size-3.5 rounded-full border shadow-xs", option.swatchClass)}
            />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
