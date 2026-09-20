import { HarnessPrompts } from "~/components/harness/HarnessPrompts";
import { useHarnessStore } from "~/harnessStore";
import { useStore } from "~/store";
import { useScrambleText } from "./StreamingLoadingAnimation";
import { ClipboardList, Sparkles } from "lucide-react";

type SendFn = (message: Record<string, unknown>) => void;

function PlanSkeletonCard() {
  const displayVerb = useScrambleText("pondering questions");

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ClipboardList className="size-3.5 animate-pulse" />
          </div>
          <span className="text-xs font-semibold text-foreground tracking-tight">
            Planning & Questionnaire
          </span>
          <span className="text-[11px] font-medium text-muted-foreground/80">{displayVerb}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
          <Sparkles className="size-3 animate-spin" />
          <span>Formulating</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <div className="h-3 w-3/4 rounded-md bg-primary/10 animate-pulse" />
        <div className="flex items-center gap-2 pt-1">
          <div className="h-6 w-24 rounded-lg bg-primary/10 animate-pulse" />
          <div className="h-6 w-28 rounded-lg bg-primary/10 animate-pulse" />
          <div className="h-6 w-20 rounded-lg bg-primary/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ChatHarnessConsentStrip(props: { threadId: string | null; send: SendFn }) {
  const harness = useHarnessStore();
  const session = props.threadId ? harness.sessions[props.threadId] : null;
  const promptCount = session?.prompts.length ?? 0;
  const isLiveTurn = session?.liveTurnId !== undefined;
  const interactionMode = useStore((state) =>
    props.threadId ? state.threadSessionById?.[props.threadId]?.interactionMode : null,
  );

  const showSkeleton = interactionMode === "plan" && isLiveTurn && promptCount === 0;

  if (!props.threadId || (promptCount === 0 && !showSkeleton)) return null;

  return (
    <div className="max-h-80 min-h-0 overflow-y-auto overscroll-contain px-1">
      {showSkeleton && <PlanSkeletonCard />}
      {promptCount > 0 && <HarnessPrompts sessionId={props.threadId} send={props.send} />}
    </div>
  );
}
