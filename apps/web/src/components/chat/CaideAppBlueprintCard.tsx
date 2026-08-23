import React, { useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent } from "./CaideCardPrimitives";

interface CaideAppBlueprintCardProps {
  appName?: string | undefined;
  template?: string | undefined;
  theme?: string | undefined;
  designDirection?: string | undefined;
  primaryColor?: string | undefined;
  features?: string[] | undefined;
  description?: string | undefined;
  onApprove?: (() => void) | undefined;
}

export const CaideAppBlueprintCard: React.FC<CaideAppBlueprintCardProps> = ({
  appName = "Flutter App",
  designDirection,
  primaryColor = "#0284c7",
  features = [],
  description,
  onApprove,
}) => {
  const [approved, setApproved] = useState(false);

  const handleApprove = () => {
    setApproved(true);
    if (onApprove) {
      onApprove();
    }
  };

  return (
    <CaideCard
      accentColor="purple"
      className="border-purple-500/30 bg-gradient-to-b from-purple-500/[0.04] to-transparent"
    >
      <CaideCardHeader
        icon={
          <div className="h-6 w-6 rounded-lg bg-purple-500/15 text-purple-500 flex items-center justify-center font-bold text-xs">
            ✦
          </div>
        }
      >
        <div className="flex-1 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-purple-500">
              App Blueprint
            </div>
            <div className="text-sm font-semibold text-foreground">{appName}</div>
          </div>
          {primaryColor && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/40 text-[11px]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: primaryColor }}
              />
              <span className="font-mono text-muted-foreground">{primaryColor}</span>
            </div>
          )}
        </div>
      </CaideCardHeader>
      <div className="px-3.5 pb-3 space-y-2.5 text-xs">
        {designDirection && (
          <p className="text-muted-foreground leading-relaxed">{designDirection}</p>
        )}
        {description && (
          <p className="text-muted-foreground/90 text-[11px] italic">{description}</p>
        )}
        {features.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-[11px] font-medium text-foreground/80">Key Features:</div>
            <div className="flex flex-wrap gap-1.5">
              {features.map((feat, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[11px] font-medium"
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="pt-2 flex items-center justify-between border-t border-border/40">
          <span className="text-[11px] text-muted-foreground">
            {approved ? "✓ Blueprint Approved" : "Ready to scaffold & generate Flutter app"}
          </span>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approved}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
              approved
                ? "bg-emerald-500 text-white cursor-default"
                : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer active:scale-95"
            }`}
          >
            {approved ? "Approved ✓" : "Approve & Build App"}
          </button>
        </div>
      </div>
    </CaideCard>
  );
};
