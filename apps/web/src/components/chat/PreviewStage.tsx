// FILE: PreviewStage.tsx
// Purpose: Floating fixed-size Android preview stage (UI-only Phase 1).
// Layer: Chat surface — sits beside the transcript and shifts it left
//         without opening the right dock. Triggered via /preview only.
// Depends on: DeviceFrame (androidPhone chassis), previewStageStore.

import type { ThreadId } from "@caide/contracts";

import { DeviceScreen } from "../device/DeviceFrame";
import { cn } from "~/lib/utils";
import { usePreviewStageStore, selectPreviewStageState } from "~/previewStageStore";

export const PREVIEW_STAGE_FIXED_WIDTH_PX = 42 * 16; // 672px — matches previous dock preview width
export const PREVIEW_STAGE_FIXED_WIDTH_CLASS = "w-[672px]";

interface PreviewStageProps {
  threadId: ThreadId;
  isVisible: boolean;
}

export function PreviewStage(props: PreviewStageProps) {
  if (!props.isVisible) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-l border-[var(--app-surface-divider)] bg-[#0a0a0a]",
        PREVIEW_STAGE_FIXED_WIDTH_CLASS,
      )}
      data-testid="preview-stage"
      style={{ width: `${PREVIEW_STAGE_FIXED_WIDTH_PX}px` }}
    >
      {/* Stage header — minimal, no selector since android only */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-[#111113] px-3">
        <span className="text-xs font-medium text-zinc-200">Preview</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
          <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
          Idle
        </span>
      </div>

      {/* Centered Android frame — UI only, no engine polling */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
        <DeviceScreen
          className="min-h-0 w-full flex-1 overflow-hidden"
          kind="androidPhone"
          pixelWidth={1080}
          pixelHeight={2400}
        >
          <div className="flex h-full w-full flex-col items-center justify-center bg-black text-center">
            <div className="flex flex-col items-center justify-center gap-1 px-[12%] text-center">
              <p className="text-balance text-[11px] leading-snug text-white/45">
                Choose a simulator or start previewing here.
              </p>
              <div
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[11px] font-medium text-black opacity-60"
                aria-hidden="true"
              >
                Start Preview
              </div>
            </div>
          </div>
        </DeviceScreen>
      </div>
    </div>
  );
}

// Hook helper for consumers that need the stage state
export function usePreviewStageVisible(threadId: ThreadId | null): boolean {
  const stageState = usePreviewStageStore(
    // eslint-disable-next-line react-hooks/rules-of-hooks
    selectPreviewStageState(threadId),
  );
  return stageState.open;
}
