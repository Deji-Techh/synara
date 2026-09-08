// FILE: gameShellStore.ts
// Purpose: Floating game-break window state (open/game/pos/size/settings/keyboard).
// Layer: UI state store

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_GAME_KEYS } from "./gameKeys";
import type { GameDifficulty, GameId, GameKeyMap } from "./gameTypes";

const STORAGE_KEY = "caide:game-shell:v1";

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
          ...(typeof p.keyboardEnabled === "boolean"
            ? { keyboardEnabled: p.keyboardEnabled }
            : {}),
          ...(p.keyMap ? { keyMap: sanitizeKeyMap(p.keyMap) } : {}),
          ...(typeof p.snakeHighScore === "number" ? { snakeHighScore: p.snakeHighScore } : {}),
          open: false,
          minimized: false,
        };
      },
    },
  ),
);
