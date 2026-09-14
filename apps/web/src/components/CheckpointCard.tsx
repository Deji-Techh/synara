import React, { useState } from "react";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { cn } from "~/lib/utils";

export interface CheckpointCardProps {
  id: string;
  reason: string;
  diff?: string;
  onApprove: (id: string) => void;
  onRequestChange: (id: string, feedback: string) => void;
}

export function CheckpointCard({
  id,
  reason,
  diff,
  onApprove,
  onRequestChange,
}: CheckpointCardProps) {
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [isRequestingChange, setIsRequestingChange] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card p-3 text-card-foreground shadow-sm">
      <div className="mb-2 flex items-center space-x-2">
        <h3 className="text-sm font-semibold tracking-wide">Review Required</h3>
      </div>

      <p className="mb-3 text-sm font-medium text-foreground/90">{reason}</p>

      {diff && (
        <div className="mb-4">
          <div className="max-h-72 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-2.5 font-mono text-xs whitespace-pre-wrap text-foreground/85">
            {showFullDiff
              ? diff
              : diff.slice(0, 400) + (diff.length > 400 ? "\n\n... (truncated)" : "")}
          </div>

          {diff.length > 400 && (
            <button
              type="button"
              onClick={() => setShowFullDiff(!showFullDiff)}
              className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
            >
              {showFullDiff ? "Hide Full Diff" : "View Full Diff"}
            </button>
          )}
        </div>
      )}

      <DisclosureRegion open={isRequestingChange}>
        <div className="mt-3 space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Specify what changes you would like made..."
            rows={3}
            className="w-full rounded-xl border border-border/70 bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsRequestingChange(false)}
              className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!feedback.trim()}
              onClick={() => {
                onRequestChange(id, feedback);
                setIsRequestingChange(false);
              }}
              className="rounded-full bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              Submit Changes
            </button>
          </div>
        </div>
      </DisclosureRegion>
      {!isRequestingChange ? (
        <div className="mt-3 flex items-center space-x-3">
          <button
            type="button"
            onClick={() => onApprove(id)}
            className={cn(
              "rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground",
              "transition-colors hover:opacity-90",
            )}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setIsRequestingChange(true)}
            className="rounded-full border border-border/70 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Request Change
          </button>
        </div>
      ) : null}
    </div>
  );
}
