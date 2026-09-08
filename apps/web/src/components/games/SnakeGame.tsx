// FILE: SnakeGame.tsx
// Purpose: Fast arcade break — canvas-free grid snake, high-score, pause on blur.
// Layer: UI game components

import { useCallback, useEffect, useRef, useState } from "react";

import { isEditableTarget, isInsideGameShell } from "./gameKeys";
import { useGameShellStore } from "./gameShellStore";
import { SNAKE_SIZE, randomFood, stepSnake, type SnakePoint } from "./snakeLogic";

const SPEEDS = { easy: 150, medium: 110, hard: 80 } as const;

export function SnakeGame() {
  const difficulty = useGameShellStore((s) => s.difficulty.snake);
  const keyboardEnabled = useGameShellStore((s) => s.keyboardEnabled);
  const keyMap = useGameShellStore((s) => s.keyMap.snake);
  const highScore = useGameShellStore((s) => s.snakeHighScore);
  const setHighScore = useGameShellStore((s) => s.setSnakeHighScore);

  const [cells, setCells] = useState<SnakePoint[]>([
    { x: 8, y: 9 },
    { x: 7, y: 9 },
    { x: 6, y: 9 },
  ]);
  const [food, setFood] = useState<SnakePoint>({ x: 12, y: 9 });
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const [paused, setPaused] = useState(false);
  const dirRef = useRef<SnakePoint>({ x: 1, y: 0 });
  const pendingDir = useRef<SnakePoint>({ x: 1, y: 0 });
  const stateRef = useRef({ cells, food, alive, paused });
  stateRef.current = { cells, food, alive, paused };

  const reset = useCallback(() => {
    const fresh = [
      { x: 8, y: 9 },
      { x: 7, y: 9 },
      { x: 6, y: 9 },
    ];
    setCells(fresh);
    setFood(randomFood(fresh));
    setScore(0);
    setAlive(true);
    setPaused(false);
    dirRef.current = { x: 1, y: 0 };
    pendingDir.current = { x: 1, y: 0 };
  }, []);

  const setDir = useCallback((d: SnakePoint) => {
    const cur = dirRef.current;
    if (d.x === -cur.x && d.y === -cur.y) return; // no 180° turns
    pendingDir.current = d;
  }, []);

  // Game tick.
  useEffect(() => {
    if (!alive || paused) return;
    const speed = SPEEDS[difficulty as keyof typeof SPEEDS] ?? SPEEDS.medium;
    const id = setInterval(() => {
      dirRef.current = pendingDir.current;
      const s = stateRef.current;
      const step = stepSnake(s.cells, dirRef.current, s.food);
      setCells(step.cells);
      setFood(step.food);
      if (step.ate) {
        setScore((prev) => {
          const next = prev + 1;
          if (next > useGameShellStore.getState().snakeHighScore) setHighScore(next);
          return next;
        });
      }
      if (!step.alive) setAlive(false);
    }, speed);
    return () => clearInterval(id);
  }, [alive, paused, difficulty, setHighScore]);

  // Auto-pause when the window loses focus — never run in the background surprise.
  useEffect(() => {
    const onBlur = () => setPaused(true);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // Optional keyboard — same master switch + focus guard as chess.
  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!isInsideGameShell(e.target)) return;
      if (isEditableTarget(e.target)) return;
      const k = e.key;
      const want = (action: string) => keyMap[action]?.key === k;
      if (want("up")) setDir({ x: 0, y: -1 });
      else if (want("down")) setDir({ x: 0, y: 1 });
      else if (want("left")) setDir({ x: -1, y: 0 });
      else if (want("right")) setDir({ x: 1, y: 0 });
      else if (want("pause")) {
        setPaused((p) => !p);
      } else return;
      // Only block page scroll for arrows/space when the game owns focus.
      if (k.startsWith("Arrow") || k === " ") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [keyboardEnabled, keyMap, setDir]);

  const occupied = new Set(cells.map((c) => c.y * SNAKE_SIZE + c.x));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Score <strong className="text-foreground">{score}</strong>
          <span className="ml-2 opacity-70">Best {Math.max(highScore, score)}</span>
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => (alive ? setPaused((p) => !p) : reset())}
            className="rounded px-2 py-1 hover:bg-muted/50 hover:text-foreground"
          >
            {!alive ? "Retry" : paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded px-2 py-1 hover:bg-muted/50 hover:text-foreground"
          >
            New
          </button>
        </div>
      </div>
      <div
        className="grid aspect-square w-full min-h-0 overflow-hidden rounded-lg border border-border/60"
        style={{ gridTemplateColumns: `repeat(${SNAKE_SIZE}, minmax(0, 1fr))` }}
        role="img"
        aria-label={alive ? `Snake score ${score}` : `Game over, score ${score}. Press retry.`}
      >
        {Array.from({ length: SNAKE_SIZE * SNAKE_SIZE }, (_, i) => {
          const x = i % SNAKE_SIZE;
          const y = Math.floor(i / SNAKE_SIZE);
          const isHead = cells[0]?.x === x && cells[0]?.y === y;
          const isBody = occupied.has(i) && !isHead;
          const isFood = food.x === x && food.y === y;
          return (
            <div
              key={i}
              className="aspect-square"
              style={{
                background: isHead
                  ? "var(--success)"
                  : isBody
                    ? "color-mix(in srgb, var(--success) 65%, transparent)"
                    : isFood
                      ? "var(--primary)"
                      : "color-mix(in srgb, var(--foreground) 5%, transparent)",
                borderRadius: isHead || isFood ? 3 : 1,
                opacity: !alive && (isHead || isBody) ? 0.45 : 1,
              }}
            />
          );
        })}
      </div>
      {/* Touch / mouse fallback so the game is fully playable with keyboard OFF. */}
      <div className="mx-auto grid grid-cols-3 gap-1" aria-label="Direction pad">
        <span />
        <PadButton label="Up" onPress={() => setDir({ x: 0, y: -1 })} />
        <span />
        <PadButton label="Left" onPress={() => setDir({ x: -1, y: 0 })} />
        <PadButton label="Down" onPress={() => setDir({ x: 0, y: 1 })} />
        <PadButton label="Right" onPress={() => setDir({ x: 1, y: 0 })} />
      </div>
      {!alive && (
        <p className="text-center text-xs text-muted-foreground">
          Game over — score {score}. {paused ? "" : "Hit Retry."}
        </p>
      )}
    </div>
  );
}

function PadButton({ label, onPress }: { label: string; onPress: () => void }) {
  const symbol = { Up: "▲", Down: "▼", Left: "◀", Right: "▶" }[label] ?? label;
  return (
    <button
      type="button"
      aria-label={`Move ${label}`}
      onClick={onPress}
      className="flex size-9 items-center justify-center rounded-md border border-border/40 bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    >
      {symbol}
    </button>
  );
}
