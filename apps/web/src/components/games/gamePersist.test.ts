// @ts-nocheck
// FILE: gamePersist.test.ts
// Purpose: Verify run persistence helpers (chess replay, move/snake sanitizers).

import { describe, expect, it } from "vitest";

import { legalMoves, replayChessMoves } from "./chessEngine";
import { sanitizeChessMoves, sanitizeSnakeRun } from "./gameShellStore";

describe("replayChessMoves", () => {
  it("rebuilds the exact board from a saved line", () => {
    const history = replayChessMoves([
      { from: [4, 1], to: [4, 3] },
      { from: [4, 6], to: [4, 4] },
    ]);
    expect(history).toHaveLength(3);
    const state = history[2]!;
    expect(state.turn).toBe("w");
    expect(state.board[3][4]?.type).toBe("p");
    expect(state.board[4][4]?.type).toBe("p");
    expect(legalMoves(state).length).toBeGreaterThan(0);
  });

  it("stops at the first illegal move instead of crashing", () => {
    const history = replayChessMoves([
      { from: [4, 1], to: [4, 3] },
      { from: [0, 0], to: [0, 5] }, // rook can't jump the pawn rank
    ]);
    expect(history).toHaveLength(2);
  });
});

describe("sanitizeChessMoves", () => {
  it("accepts a valid line and drops garbage", () => {
    expect(sanitizeChessMoves([{ from: [4, 1], to: [4, 3] }])).toEqual([
      { from: [4, 1], to: [4, 3] },
    ]);
    expect(sanitizeChessMoves("nope")).toEqual([]);
    expect(sanitizeChessMoves([{ from: [9, 9], to: [4, 3] }])).toEqual([]);
  });
});

describe("sanitizeSnakeRun", () => {
  it("accepts a valid run and rejects out-of-bounds cells", () => {
    const run = {
      cells: [
        { x: 8, y: 9 },
        { x: 7, y: 9 },
      ],
      food: { x: 12, y: 9 },
      score: 4,
      dir: { x: 1, y: 0 },
      alive: true,
    };
    expect(sanitizeSnakeRun(run)).toEqual(run);
    expect(sanitizeSnakeRun({ ...run, cells: [{ x: 99, y: 9 }] })).toBeNull();
    expect(sanitizeSnakeRun(null)).toBeNull();
  });
});
