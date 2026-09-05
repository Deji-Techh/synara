import React, { useState } from "react";
import { IconSparkles, IconCheck } from "@tabler/icons-react";
import { CaideCard, CaideCardHeader, CaideBadge, CaideCardContent } from "./CaideCardPrimitives";
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
  const [approved] = useState(false);

  return (
    <CaideCard
      state={approved ? "complete" : pending ? "pending" : undefined}
      accent={approved ? "success" : "info"}
      className="border border-border/50 bg-card/60 my-1.5"
    >
      <CaideCardHeader
        icon={<IconSparkles size={15} />}
        accent={approved ? "success" : "info"}
      >
        <div className="flex w-full items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <CaideBadge accent={approved ? "success" : "info"}>Blueprint</CaideBadge>
            <span className="truncate font-semibold text-foreground/90">
              {displayAppName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5">
              <span className="size-2 rounded-full shadow-2xs" style={{ backgroundColor: color }} />
              <span className="font-mono text-[10px] text-muted-foreground">{color}</span>
            </div>
            {approved ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--success)] font-medium">
                <IconCheck size={11} strokeWidth={2.5} />
                Approved
              </span>
            ) : pending ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--info)]">
                <span className="size-1.5 rounded-full bg-[var(--info)] animate-pulse" />
                Ready for review
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/60">Reviewed</span>
            )}
          </div>
        </div>
      </CaideCardHeader>
      <CaideCardContent className="px-2.5 pb-2.5 pt-0.5">
        {displayDesignDirection && (
          <p className="text-xs text-muted-foreground leading-relaxed">{displayDesignDirection}</p>
        )}
        {description && (
          <p className="mt-1 text-[11px] italic text-muted-foreground/75 leading-relaxed">
            {description}
          </p>
        )}
        {features.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Key Features
            </div>
            <div className="flex flex-wrap gap-1">
              {features.map((feat, idx) => (
                <span
                  key={idx}
                  className="rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 border-t border-border/30 pt-2">
          {approved ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--success)] font-medium">
              <IconCheck size={12} strokeWidth={2.5} />
              <span>Blueprint approved — building started.</span>
            </div>
          ) : pending ? (
            <p className="text-[11px] text-muted-foreground/80">
              Review and customize the blueprint in the composer below. Approve there to apply your changes.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">
              Blueprint was reviewed in the composer.
            </p>
          )}
        </div>
      </CaideCardContent>
    </CaideCard>
  );
};
