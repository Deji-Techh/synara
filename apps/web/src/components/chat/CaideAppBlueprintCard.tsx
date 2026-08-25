import React from "react";
import { CaideCard, CaideCardHeader, CaideCardContent } from "./CaideCardPrimitives";
import { cn } from "~/lib/utils";

interface CaideAppBlueprintCardProps {
  appName?: string | undefined;
  template?: string | undefined;
  theme?: string | undefined;
  designDirection?: string | undefined;
  primaryColor?: string | undefined;
  features?: string[] | undefined;
  description?: string | undefined;
  framework?: string | undefined;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/u;

export const CaideAppBlueprintCard: React.FC<CaideAppBlueprintCardProps> = ({
  appName = "App",
  designDirection,
  primaryColor = "#0284c7",
  features = [],
  description,
}) => {
  const color = COLOR_RE.test(primaryColor) ? primaryColor : "#0284c7";

  return (
    <CaideCard
      accentColor="purple"
      className="border-purple-500/30 bg-gradient-to-b from-purple-500/[0.05] to-transparent"
    >
      <CaideCardHeader
        icon={
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15 text-[12px] font-bold text-purple-500">
            ✦
          </div>
        }
      >
        <div className="flex w-full items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-500">
              App Blueprint
            </div>
            <div className="truncate text-[13px] font-semibold text-foreground">{appName}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{color}</span>
          </div>
        </div>
      </CaideCardHeader>
      <CaideCardContent>
        {designDirection && (
          <p className="leading-relaxed text-muted-foreground">{designDirection}</p>
        )}
        {description && (
          <p className="mt-1 text-[11px] italic leading-relaxed text-muted-foreground/80">
            {description}
          </p>
        )}
        {features.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-foreground/70">
              Key features
            </div>
            <div className="flex flex-wrap gap-1.5">
              {features.map((feat, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-300"
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2.5 border-t border-border/40 pt-2.5">
          <p className={cn("text-[11px] text-muted-foreground")}>
            This blueprint waits for your review in the composer. Approve it there to start
            building.
          </p>
        </div>
      </CaideCardContent>
    </CaideCard>
  );
};