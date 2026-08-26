import React, { useCallback, useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent } from "./CaideCardPrimitives";
import { cn } from "~/lib/utils";
import { newCommandId } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { useOpenPendingBlueprint } from "~/usePendingInteractionHooks";
import { Button } from "../ui/button";

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
  const [isApproving, setIsApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const pending = useOpenPendingBlueprint();

  const handleApprove = useCallback(async () => {
    if (!pending || isApproving || approved) return;
    setIsApproving(true);
    try {
      const api = ensureNativeApi();
      await api.orchestration.dispatchCommand({
        type: "thread.approval.respond",
        commandId: newCommandId(),
        threadId: pending.threadId as never,
        requestId: pending.requestId as never,
        decision: "accept",
        ...(pending.lifecycleGeneration
          ? { lifecycleGeneration: pending.lifecycleGeneration as never }
          : {}),
        createdAt: new Date().toISOString(),
      });
      setApproved(true);
    } catch {
      setIsApproving(false);
    }
  }, [pending, isApproving, approved]);

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
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Approve to apply this blueprint and start building.
              </p>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproving}
                className="h-7 px-3 text-xs font-semibold"
              >
                {isApproving ? "Approving..." : "Approve & Build"}
              </Button>
            </div>
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