import { useCallback, useEffect, useRef, useState } from "react";

interface StreamingLoadingAnimationProps {
  variant?: "initial" | "streaming";
}

const INITIAL_VERBS = [
  "thinking",
  "reasoning",
  "exploring codebase",
  "architecting Flutter UI",
  "organizing widget tree",
  "designing Material theme",
  "planning state model",
  "brainstorming",
];

const STREAMING_VERBS = [
  "generating Flutter code",
  "crafting widgets",
  "assembling UI",
  "wiring controllers",
  "polishing theme",
  "building components",
  "styling layout",
  "refining navigation",
];

const SCRAMBLE_CHARS = "abcdefghijklmnopqrstuvwxyz";
const SCRAMBLE_SPEED_MS = 30;
const REVEAL_STAGGER_MS = 60;

function useRotatingVerb(verbs: string[]): string {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * verbs.length),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % verbs.length);
    }, 4000);
    return () => clearInterval(id);
  }, [verbs]);
  return verbs[index] ?? verbs[0] ?? "building";
}

export function useScrambleText(text: string) {
  const [display, setDisplay] = useState(text + "...");
  const rafRef = useRef<number>(0);
  const prevTextRef = useRef(text);

  const scramble = useCallback((target: string) => {
    const len = Math.max(target.length, prevTextRef.current.length);
    const startTime = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const revealed = Math.floor(elapsed / REVEAL_STAGGER_MS);
      let result = "";
      for (let i = 0; i < len; i++) {
        if (i < revealed) {
          result += i < target.length ? target[i] : "";
        } else {
          const scrambleCycle = Math.floor(elapsed / SCRAMBLE_SPEED_MS + i);
          result += SCRAMBLE_CHARS[scrambleCycle % SCRAMBLE_CHARS.length];
        }
      }

      if (revealed >= len) {
        setDisplay(target + "...");
        prevTextRef.current = target;
        return;
      }

      setDisplay(result + "...");
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (text !== prevTextRef.current) {
      scramble(text);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, scramble]);

  return display;
}

function ScrambleVerb({ verb }: { verb: string }) {
  const display = useScrambleText(verb);
  return (
    <span
      className="inline-block text-xs font-medium text-muted-foreground/80 tracking-wide select-none"
      aria-hidden="true"
    >
      {display}
    </span>
  );
}

export function StreamingLoadingAnimation({
  variant = "streaming",
}: StreamingLoadingAnimationProps) {
  const verb = useRotatingVerb(
    variant === "initial" ? INITIAL_VERBS : STREAMING_VERBS,
  );

  return (
    <div className="inline-flex items-center gap-2 py-1 select-none animate-in fade-in duration-300">
      <div className="flex items-center gap-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
        </span>
        <div className="flex items-end gap-0.5 h-3.5 px-0.5">
          <span className="w-1 bg-primary/70 rounded-full animate-pulse h-2" style={{ animationDelay: "0ms" }} />
          <span className="w-1 bg-primary/90 rounded-full animate-pulse h-3.5" style={{ animationDelay: "150ms" }} />
          <span className="w-1 bg-primary rounded-full animate-pulse h-2.5" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
      <ScrambleVerb verb={verb} />
    </div>
  );
}

export default StreamingLoadingAnimation;
