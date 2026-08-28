// ChatView — dummy shell (pure Caide, no dyad)
// Rebuilt as minimal shell per 002 §1: RouteInsetSurface + PreviewStage 672px + pill composer
// Real harness (caideRunner + L0-L3 + Router→Builder→Verifier) lives in apps/server/src/harness/*

import type { ThreadId } from "@caide/contracts";
import { PreviewStage } from "./chat/PreviewStage";
import { ComposerColumnFrame } from "./chat/ComposerColumnFrame";
import { COMPOSER_INPUT_SURFACE_CLASS_NAME, COMPOSER_INPUT_SHELL_CLASS_NAME, COMPOSER_EDITOR_PADDING_CLASS_NAME } from "./chat/composerPickerStyles";

interface ChatViewProps {
  threadId: ThreadId;
}

export default function ChatView({ threadId }: ChatViewProps) {
  return (
    <div className="flex h-dvh min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-background-surface)]">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col items-center justify-center gap-4 text-center">
              <h1 className="text-2xl font-bold tracking-tight">Caide — new shell</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                Pure Caide harness. Chat timeline is dummy — real token/event stream from <code className="rounded bg-muted px-1 py-0.5 text-xs">caideRunner</code> will render here.
                Preview is live per slice (visual verification M11).
              </p>
              <div className="w-full max-w-md rounded-xl border border-border bg-card p-3 text-left text-xs text-muted-foreground">
                Slice loop: Builder → screenshot → Verifier (fresh ctx, confidence) → Fixer → Taste → human checkpoint.
              </div>
            </div>
          </div>
          <PreviewStage threadId={threadId} isVisible={true} />
        </div>
        <ComposerColumnFrame>
          <div className={COMPOSER_INPUT_SHELL_CLASS_NAME}>
            <div className={COMPOSER_INPUT_SURFACE_CLASS_NAME}>
              <div className={COMPOSER_EDITOR_PADDING_CLASS_NAME}>
                <div className="text-sm text-muted-foreground/60">Composer pill — floating, theme-aware, backdrop-blur-xl (M3). Input will be wired to caideRunner.</div>
              </div>
            </div>
          </div>
        </ComposerColumnFrame>
      </div>
    </div>
  );
}
