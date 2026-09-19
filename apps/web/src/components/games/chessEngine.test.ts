// @ts-nocheck
// FILE: chessEngine.test.ts
// Purpose: Verify chess rules (opening moves, check detection, AI returns legal).

import { describe, expect, it } from "vitest";

import { pickAiMove } from "./chessAi";
import { applyMove, initialChessState, isInCheck, legalMoves } from "./chessEngine";

describe("chessEngine", () => {
  it("offers 20 opening moves for white", () => {
    expect(legalMoves(initialChessState())).toHaveLength(20);
  });

  it("applies e2e4 and hands turn to black", () => {
    const s0 = initialChessState();
    const next = applyMove(s0, { from: [4, 1], to: [4, 3] });
    expect(next.turn).toBe("b");
    expect(next.board[3][4]?.type).toBe("p");
    expect(next.board[1][4]).toBeNull();
    expect(next.enPassant).toEqual([4, 2]);
  });

  it("detects fool's mate checkmate (black mates)", () => {
    let s = initialChessState();
    s = applyMove(s, { from: [5, 1], to: [5, 2] }); // f3
    s = applyMove(s, { from: [4, 6], to: [4, 4] }); // e5
    s = applyMove(s, { from: [6, 1], to: [6, 3] }); // g4
    s = applyMove(s, { from: [3, 7], to: [7, 3] }); // Qh4#
    expect(isInCheck(s, "w")).toBe(true);
    expect(legalMoves(s)).toHaveLength(0);
  });
});

describe("chessAi", () => {
  it("returns a legal move at every difficulty", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      const s = initialChessState();
      const move = pickAiMove(s, d);
      expect(move).not.toBeNull();
      const legal = legalMoves(s);
      expect(
        legal.some((m) => m.from.join() === move!.from.join() && m.to.join() === move!.to.join()),
      ).toBe(true);
    }
  });
});
