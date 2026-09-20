import { useCallback, useEffect, useRef, useState } from "react";
import { useHarnessStore } from "~/harnessStore";

interface StreamingLoadingAnimationProps {
  variant?: "initial" | "streaming";
}

// Framework-neutral: these rotate under ANY project (the old list
// hardcoded Flutter verbs, so a parked website turn claimed to be
// "generating Flutter code"). When the turn is parked on user input the
// caller sees the waiting copy instead — busy verbs while awaiting answers
// read as a hang.
const INITIAL_VERBS = [
  "thinking",
  "reasoning",
  "exploring codebase",
  "architecting UI",
  "organizing components",
  "designing theme",
  "planning state model",
  "brainstorming",
];

const STREAMING_VERBS = [
  "generating code",
  "crafting components",
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
  const [index, setIndex] = useState(() => Math.floor(Math.random() * verbs.length));
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
  const verb = useRotatingVerb(variant === "initial" ? INITIAL_VERBS : STREAMING_VERBS);
  const store = useHarnessStore();
  const activeId = store.activeSessionId;
  const waitingOnUser = activeId != null && (store.sessions[activeId]?.prompts.length ?? 0) > 0;

  if (variant === "initial") {
    const orbs = [0, 1, 2, 3, 4];
    return (
      <div className="flex items-center gap-3 py-1.5 select-none animate-in fade-in duration-300">
        <div className="relative flex h-6 items-center justify-start gap-1.5">
          {orbs.map((index) => (
            <div
              key={index}
              className="relative flex items-center justify-center"
              style={{
                animation: `orb-bounce 1.1s cubic-bezier(0.22, 1.2, 0.36, 1) infinite`,
                animationDelay: `${index * 70}ms`,
              }}
            >
              {/* Soft halo glow */}
              <div
                className="absolute -inset-1 rounded-full blur-xs pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in srgb, var(--primary) 40%, transparent), transparent 70%)",
                  animation: `halo-glow 1.1s ease-out infinite`,
                  animationDelay: `${index * 70}ms`,
                }}
              />
              {/* Core orb */}
              <div
                className="h-2 w-2 rounded-full bg-primary"
                style={{
                  boxShadow: "0 0 6px color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
              />
            </div>
          ))}
        </div>
        {waitingOnUser ? (
          <span className="inline-block text-xs font-medium text-muted-foreground/80 tracking-wide select-none">
            Waiting for your answers…
          </span>
        ) : (
          <ScrambleVerb verb={verb} />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 py-1 select-none animate-in fade-in duration-300">
      <div className="flex h-5 items-end gap-[3px]">
        <div
          className="w-[3px] rounded-full bg-primary"
          style={{ animation: "bar-oscillate-1 1.0s cubic-bezier(0.22, 1.2, 0.36, 1) infinite" }}
        />
        <div
          className="w-[3px] rounded-full bg-primary"
          style={{
            animation: "bar-oscillate-2 1.2s cubic-bezier(0.22, 1.2, 0.36, 1) infinite 120ms",
          }}
        />
        <div
          className="w-[3px] rounded-full bg-primary"
          style={{
            animation: "bar-oscillate-3 1.1s cubic-bezier(0.22, 1.2, 0.36, 1) infinite 250ms",
          }}
        />
        <div
          className="w-[3px] rounded-full bg-primary"
          style={{
            animation: "bar-oscillate-4 1.05s cubic-bezier(0.22, 1.2, 0.36, 1) infinite 80ms",
          }}
        />
        <div
          className="w-[3px] rounded-full bg-primary"
          style={{
            animation: "bar-oscillate-5 1.3s cubic-bezier(0.22, 1.2, 0.36, 1) infinite 300ms",
          }}
        />
      </div>
      {waitingOnUser ? (
        <span className="inline-block text-xs font-medium text-muted-foreground/80 tracking-wide select-none">
          Waiting for your answers…
        </span>
      ) : (
        <ScrambleVerb verb={verb} />
      )}
    </div>
  );
}

export default StreamingLoadingAnimation;
