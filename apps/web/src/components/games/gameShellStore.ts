// @ts-nocheck
// FILE: gameShellStore.ts
// Purpose: Floating game-break window state incl. persisted live runs + settings.
// Layer: UI state store

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChessMove, ChessPieceType } from "./chessEngine";
import { DEFAULT_GAME_KEYS } from "./gameKeys";
import type { GameDifficulty, GameId, GameKeyMap } from "./gameTypes";

const STORAGE_KEY = "caide:game-shell:v1";
const MAX_CHESS_MOVES = 300;
const SNAKE_BOUND = 18;

export interface SnakeRunState {
  cells: { x: number; y: number }[];
  food: { x: number; y: number };
  score: number;
  dir: { x: number; y: number };
  alive: boolean;
}

export interface GameShellState {
  open: boolean;
  game: GameId;
  minimized: boolean;
  /** Window position (viewport px, clamped on render). */
  pos: { x: number; y: number };
  /** Window size (px, clamped on render). */
  size: { w: number; h: number };
  difficulty: Record<GameId, GameDifficulty>;
  /** Master kill-switch. Default OFF so games never steal keys while working. */
  keyboardEnabled: boolean;
  keyMap: Record<GameId, GameKeyMap>;
  snakeHighScore: number;
  /** Live chess line (replayed on load so the board resumes exactly). */
  chessMoves: ChessMove[];
  /** Live snake run (restored paused so it never runs as a surprise). */
  snakeRun: SnakeRunState | null;
}

interface GameShellStore extends GameShellState {
  openGame: (game: GameId) => void;
  close: () => void;
  toggleMinimized: () => void;
  setPos: (pos: { x: number; y: number }) => void;
  setSize: (size: { w: number; h: number }) => void;
  setDifficulty: (game: GameId, difficulty: GameDifficulty) => void;
  setKeyboardEnabled: (enabled: boolean) => void;
  setKeyBinding: (game: GameId, action: string, key: string) => void;
  resetKeyMap: (game: GameId) => void;
  setSnakeHighScore: (score: number) => void;
  setChessMoves: (moves: ChessMove[]) => void;
  setSnakeRun: (run: SnakeRunState | null) => void;
}

const DEFAULTS: GameShellState = {
  open: false,
  game: "chess",
  minimized: false,
  pos: { x: 96, y: 96 },
  size: { w: 420, h: 540 },
  difficulty: { chess: "medium", snake: "medium" },
  keyboardEnabled: false,
  keyMap: structuredClone(DEFAULT_GAME_KEYS),
  snakeHighScore: 0,
  chessMoves: [],
  snakeRun: null,
};

function sanitizeKeyMap(value: unknown): Record<GameId, GameKeyMap> {
  if (typeof value !== "object" || value === null) return structuredClone(DEFAULT_GAME_KEYS);
  const out = structuredClone(DEFAULT_GAME_KEYS);
  for (const game of ["chess", "snake"] as const) {
    const rec = (value as Record<string, unknown>)[game];
    if (typeof rec !== "object" || rec === null) continue;
    for (const [action, binding] of Object.entries(rec as Record<string, unknown>)) {
      if (!(action in out[game])) continue;
      if (typeof binding !== "object" || binding === null) continue;
      const key = (binding as { key?: unknown }).key;
      if (typeof key === "string" && key.length > 0 && key.length <= 16) {
        out[game][action] = { label: out[game][action].label, key };
      }
    }
  }
  return out;
}

function isSquare(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 8)
  );
}

export function sanitizeChessMoves(value: unknown): ChessMove[] {
  if (!Array.isArray(value)) return [];
  const out: ChessMove[] = [];
  for (const m of value.slice(0, MAX_CHESS_MOVES)) {
    if (typeof m !== "object" || m === null) return [];
    const { from, to, promotion } = m as Record<string, unknown>;
    if (!isSquare(from) || !isSquare(to)) return [];
    if (promotion !== undefined && !["q", "r", "b", "n"].includes(promotion as string)) return [];
    out.push({
      from: [from[0], from[1]],
      to: [to[0], to[1]],
      ...(promotion ? { promotion: promotion as ChessPieceType } : {}),
    });
  }
  return out;
}

function isGridPoint(v: unknown): v is { x: number; y: number } {
  if (typeof v !== "object" || v === null) return false;
  const { x, y } = v as Record<string, unknown>;
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    (x as number) >= 0 &&
    (x as number) < SNAKE_BOUND &&
    (y as number) >= 0 &&
    (y as number) < SNAKE_BOUND
  );
}

export function sanitizeSnakeRun(value: unknown): SnakeRunState | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  const { cells, food, score, dir, alive } = value as Record<string, unknown>;
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > SNAKE_BOUND * SNAKE_BOUND) {
    return null;
  }
  if (!cells.every(isGridPoint) || !isGridPoint(food)) return null;
  if (typeof score !== "number" || score < 0 || score > 10000) return null;
  if (typeof alive !== "boolean") return null;
  const safeDir = isGridPoint(dir) ? { x: dir.x, y: dir.y } : { x: 1, y: 0 };
  return {
    cells: cells.map((c) => ({ x: (c as { x: number }).x, y: (c as { y: number }).y })),
    food: { x: (food as { x: number }).x, y: (food as { y: number }).y },
    score: Math.floor(score),
    dir: safeDir,
    alive,
  };
}

export const useGameShellStore = create<GameShellStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      openGame: (game) => set({ open: true, game, minimized: false }),
      close: () => set({ open: false }),
      toggleMinimized: () => set((s) => ({ minimized: !s.minimized })),
      setPos: (pos) => set({ pos }),
      setSize: (size) => set({ size }),
      setDifficulty: (game, difficulty) =>
        set((s) => ({ difficulty: { ...s.difficulty, [game]: difficulty } })),
      setKeyboardEnabled: (enabled) => set({ keyboardEnabled: enabled }),
      setKeyBinding: (game, action, key) =>
        set((s) => ({
          keyMap: {
            ...s.keyMap,
            [game]: { ...s.keyMap[game], [action]: { label: s.keyMap[game][action].label, key } },
          },
        })),
      resetKeyMap: (game) =>
        set((s) => ({ keyMap: { ...s.keyMap, [game]: structuredClone(DEFAULT_GAME_KEYS[game]) } })),
      setSnakeHighScore: (score) => set({ snakeHighScore: score }),
      setChessMoves: (moves) => set({ chessMoves: moves }),
      setSnakeRun: (run) => set({ snakeRun: run }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        game: s.game,
        pos: s.pos,
        size: s.size,
        difficulty: s.difficulty,
        keyboardEnabled: s.keyboardEnabled,
        keyMap: s.keyMap,
        snakeHighScore: s.snakeHighScore,
        chessMoves: s.chessMoves,
        snakeRun: s.snakeRun,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameShellState>;
        return {
          ...current,
          ...(typeof p.game === "string" && (p.game === "chess" || p.game === "snake")
            ? { game: p.game }
            : {}),
          ...(p.pos && typeof p.pos.x === "number" && typeof p.pos.y === "number"
            ? { pos: p.pos }
            : {}),
          ...(p.size && typeof p.size.w === "number" && typeof p.size.h === "number"
            ? { size: p.size }
            : {}),
          ...(p.difficulty ? { difficulty: { ...current.difficulty, ...p.difficulty } } : {}),
          ...(typeof p.keyboardEnabled === "boolean" ? { keyboardEnabled: p.keyboardEnabled } : {}),
          ...(p.keyMap ? { keyMap: sanitizeKeyMap(p.keyMap) } : {}),
          ...(typeof p.snakeHighScore === "number" ? { snakeHighScore: p.snakeHighScore } : {}),
          ...(p.chessMoves ? { chessMoves: sanitizeChessMoves(p.chessMoves) } : {}),
          ...(p.snakeRun !== undefined ? { snakeRun: sanitizeSnakeRun(p.snakeRun) } : {}),
          open: false,
          minimized: false,
        };
      },
    },
  ),
);
