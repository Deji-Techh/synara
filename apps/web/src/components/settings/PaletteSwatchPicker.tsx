import { cn } from "~/lib/utils";
import { PALETTE_THEMES, type PaletteThemeId } from "~/theme/paletteThemes";

export function PaletteSwatchPicker(props: {
  value: PaletteThemeId;
  onValueChange: (value: PaletteThemeId) => void;
  ariaLabel: string;
}) {
  const { value, onValueChange, ariaLabel } = props;

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-3 sm:grid-cols-2">
      {PALETTE_THEMES.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.name}
            className={cn(
              "group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
              isActive
                ? "border-foreground bg-foreground/[0.04]"
                : "border-border/70 hover:border-foreground/25",
            )}
            onClick={() => onValueChange(option.id)}
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-11 shrink-0 items-center overflow-hidden rounded-md border border-border/70"
            >
              {option.swatches.map((swatch) => (
                <span key={swatch} className="h-full flex-1" style={{ backgroundColor: swatch }} />
              ))}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-sm",
                  isActive ? "font-medium text-foreground" : "text-foreground/90",
                )}
              >
                {option.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
