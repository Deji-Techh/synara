import React, { useState } from "react";

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
    <div className="my-4 p-4 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] text-white shadow-xl max-w-2xl">
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-lg">🔍</span>
        <h3 className="font-semibold text-sm tracking-wide text-neutral-200">Review Required</h3>
      </div>

      <p className="text-sm text-neutral-300 font-medium mb-3">{reason}</p>

      {diff && (
        <div className="mb-4">
          <div className="bg-[#121212] rounded-xl p-3 border border-[#262626] font-mono text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-72">
            {showFullDiff
              ? diff
              : diff.slice(0, 400) + (diff.length > 400 ? "\n\n... (truncated)" : "")}
          </div>

          {diff.length > 400 && (
            <button
              type="button"
              onClick={() => setShowFullDiff(!showFullDiff)}
              className="mt-1 text-xs text-neutral-400 hover:text-white underline"
            >
              {showFullDiff ? "Hide Full Diff" : "View Full Diff"}
            </button>
          )}
        </div>
      )}

      {isRequestingChange ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Specify what changes you would like made..."
            rows={3}
            className="w-full bg-[#121212] border border-[#333333] rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsRequestingChange(false)}
              className="px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white"
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
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#E8493C] text-white hover:bg-opacity-90 disabled:opacity-50"
            >
              Submit Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-3 mt-3">
          <button
            type="button"
            onClick={() => onApprove(id)}
            className="px-5 py-2 rounded-full text-xs font-semibold bg-white text-[#0D0D0D] hover:bg-neutral-200 transition-colors shadow-sm"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setIsRequestingChange(true)}
            className="px-4 py-2 rounded-full text-xs font-medium border border-[#333333] text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
          >
            Request Change
          </button>
        </div>
      )}
    </div>
  );
}
