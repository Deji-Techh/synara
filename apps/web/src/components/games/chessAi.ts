// @ts-nocheck
// FILE: chessAi.ts
// Purpose: Local minimax chess AI. Depth maps to Easy/Medium/Hard, capped for UI.
// Layer: UI game logic

import {
  applyMove,
  isInCheck,
  legalMoves,
  type ChessGameState,
  type ChessMove,
} from "./chessEngine";
import type { GameDifficulty } from "./gameTypes";

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const DEPTH: Record<GameDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

function evaluate(state: ChessGameState): number {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f];
      if (!p) continue;
      const v = VALUES[p.type] + (p.type === "p" ? (p.color === "w" ? r : 7 - r) * 6 : 0);
      score += p.color === "w" ? v : -v;
    }
  return score;
}

function minimax(state: ChessGameState, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    // Checkmate or stalemate from side-to-move perspective.
    if (isInCheck(state, state.turn)) return state.turn === "w" ? -100000 - depth : 100000 + depth;
    return 0;
  }
  if (depth === 0) return evaluate(state);
  if (state.turn === "w") {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, minimax(applyMove(state, m), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, minimax(applyMove(state, m), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/** Pick AI move for side to move. Returns null when no legal moves. */
export function pickAiMove(state: ChessGameState, difficulty: GameDifficulty): ChessMove | null {
  const depth = DEPTH[difficulty];
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const maximizing = state.turn === "w";
  let best: ChessMove | null = null;
  let bestScore = maximizing ? -Infinity : Infinity;
  // Shuffle to vary play between equal lines.
  const ordered = [...moves].sort(() => Math.random() - 0.5);
  for (const m of ordered) {
    const score = minimax(applyMove(state, m), depth - 1, -Infinity, Infinity);
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
