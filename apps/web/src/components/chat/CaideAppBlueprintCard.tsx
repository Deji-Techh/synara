import React, { useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent } from "./CaideCardPrimitives";
import { useOpenPendingBlueprint } from "~/usePendingInteractionHooks";

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
  const pending = useOpenPendingBlueprint();
  // When a pending blueprint exists, derive display from the live pending
  // blueprint (the source of truth including any composer edits) instead of
  // the stale snapshot props from the original <caide-app-blueprint> tag.
  const liveBlueprint = pending?.blueprint as Record<string, unknown> | undefined;
  const displayAppName =
    typeof liveBlueprint?.appName === "string" && liveBlueprint.appName.trim() !== ""
      ? (liveBlueprint.appName as string)
      : appName;
  const displayDesignDirection =
    typeof liveBlueprint?.designDirection === "string"
      ? (liveBlueprint.designDirection as string)
      : designDirection;
  const displayPrimaryColor =
    typeof liveBlueprint?.primaryColor === "string" &&
    COLOR_RE.test(liveBlueprint.primaryColor as string)
      ? (liveBlueprint.primaryColor as string)
      : primaryColor;
  const color = COLOR_RE.test(displayPrimaryColor) ? displayPrimaryColor : "#0284c7";
  const [approved, setApproved] = useState(false);

  // Static card no longer owns the approve action. The composer
  // CaideBlueprintApprovalPanel is the single writer that collects edits
  // and sends blueprintEdits atomically. Approving here would bypass edits
  // and make the agent use the draft (reported as "uses its own not mine").

  return (
    <CaideCard accentColor="gray" className="border-border/70 bg-card/60">
      <CaideCardHeader
        icon={
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-[12px] font-bold">
            ✦
          </div>
        }
      >
        <div className="flex w-full items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              App Blueprint
            </div>
            <div className="truncate text-[13px] font-semibold text-foreground">
              {displayAppName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{color}</span>
          </div>
        </div>
      </CaideCardHeader>
      <CaideCardContent>
        {displayDesignDirection && (
          <p className="leading-relaxed text-muted-foreground">{displayDesignDirection}</p>
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
                  className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2.5 border-t border-border/40 pt-2.5">
          {approved ? (
            <p className="text-[11px] text-muted-foreground">
              Blueprint approved — building started.
            </p>
          ) : pending ? (
            <p className="text-[11px] text-muted-foreground">
              Review and edit the blueprint in the composer below. Approve there to apply your
              changes — the agent will use your edited values.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Blueprint was reviewed in the composer.
            </p>
          )}
        </div>
      </CaideCardContent>
    </CaideCard>
  );
};
