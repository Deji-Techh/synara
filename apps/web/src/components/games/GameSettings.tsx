// FILE: GameSettings.tsx
// Purpose: Game-break settings — difficulty, keyboard master switch, key remapping.
// Layer: UI game components

import { useState } from "react";

import { normalizeGameKey } from "./gameKeys";
import { useGameShellStore } from "./gameShellStore";
import { GAME_META, type GameDifficulty, type GameId } from "./gameTypes";
import { cn } from "~/lib/utils";

const DIFFICULTIES: GameDifficulty[] = ["easy", "medium", "hard"];

export function GameSettings({ game }: { game: GameId }) {
  const difficulty = useGameShellStore((s) => s.difficulty[game]);
  const setDifficulty = useGameShellStore((s) => s.setDifficulty);
  const keyboardEnabled = useGameShellStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useGameShellStore((s) => s.setKeyboardEnabled);
  const keyMap = useGameShellStore((s) => s.keyMap[game]);
  const setKeyBinding = useGameShellStore((s) => s.setKeyBinding);
  const resetKeyMap = useGameShellStore((s) => s.resetKeyMap);
  const [recording, setRecording] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 p-1">
      <section>
        <h4 className="mb-1.5 text-xs font-semibold text-foreground">
          Difficulty — {GAME_META[game].title}
        </h4>
        <div className="flex gap-1" role="radiogroup" aria-label={`${GAME_META[game].title} difficulty`}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={difficulty === d}
              onClick={() => setDifficulty(game, d)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                difficulty === d
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          {game === "chess" ? "AI search depth 1 / 2 / 3." : "Snake speed: slow / normal / fast."}
        </p>
      </section>

      <section className="rounded-lg border border-border/40 p-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Keyboard controls</span>
          <button
            type="button"
            role="switch"
            aria-checked={keyboardEnabled}
            aria-label="Toggle game keyboard controls"
            onClick={() => setKeyboardEnabled(!keyboardEnabled)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              keyboardEnabled ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
                keyboardEnabled ? "left-[18px]" : "left-0.5",
              )}
            />
          </button>
        </label>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
          {keyboardEnabled
            ? "On — but keys work ONLY while this window is focused, never in chat, terminal, or editor."
            : "Off (default) — games are mouse/touch only and can never intercept your typing."}
        </p>
      </section>

      {keyboardEnabled && (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">Key mapping</h4>
            <button
              type="button"
              onClick={() => resetKeyMap(game)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Reset defaults
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {Object.entries(keyMap).map(([action, binding]) => (
              <li
                key={action}
                className="flex items-center justify-between rounded-md px-1 py-0.5 text-xs"
              >
                <span className="text-muted-foreground">{binding.label}</span>
                <button
                  type="button"
                  onClick={() => setRecording(recording === action ? null : action)}
                  onKeyDown={(e) => {
                    if (recording !== action) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key !== "Escape") setKeyBinding(game, action, e.key);
                    setRecording(null);
                  }}
                  className={cn(
                    "min-w-20 rounded border px-2 py-1 text-center font-mono text-[11px]",
                    recording === action
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border/40 bg-muted/30 text-foreground hover:bg-muted/60",
                  )}
                  aria-label={`Remap ${binding.label}, currently ${normalizeGameKey(binding.key)}`}
                >
                  {recording === action ? "press key…" : normalizeGameKey(binding.key)}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Click a key, press the replacement. Esc cancels.
          </p>
        </section>
      )}
    </div>
  );
}
