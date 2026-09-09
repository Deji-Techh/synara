// FILE: chessEngine.ts
// Purpose: Self-contained minimal chess rules (no external dep): move gen, check,
//   castling, en passant, promotion. Powers board UI + local minimax AI.
// Layer: UI game logic

export type ChessColor = "w" | "b";
export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";
export interface ChessPiece {
  type: ChessPieceType;
  color: ChessColor;
}
export type ChessBoard = (ChessPiece | null)[][]; // [rank0=rank1 .. rank7=rank8][file a..h]

export interface ChessMove {
  from: [number, number];
  to: [number, number];
  promotion?: ChessPieceType;
}

export interface ChessGameState {
  board: ChessBoard;
  turn: ChessColor;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassant: [number, number] | null;
  halfmove: number;
}

export const CHESS_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parseFen(fen: string): ChessGameState {
  const [placement, turn, castling, ep] = fen.split(" ");
  const board: ChessBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = placement.split("/");
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        const color: ChessColor = ch === ch.toUpperCase() ? "w" : "b";
        board[rank][file] = { type: ch.toLowerCase() as ChessPieceType, color };
        file += 1;
      }
    }
  });
  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: {
      wK: castling.includes("K"),
      wQ: castling.includes("Q"),
      bK: castling.includes("k"),
      bQ: castling.includes("q"),
    },
    enPassant: ep !== "-" ? [ep.charCodeAt(0) - 97, Number(ep[1]) - 1] : null,
    halfmove: 0,
  };
}

export function initialChessState(): ChessGameState {
  return parseFen(CHESS_START_FEN);
}

function inBounds(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

function cloneBoard(board: ChessBoard): ChessBoard {
  return board.map((row) => row.map((p) => (p ? { ...p } : null)));
}

export function findKing(board: ChessBoard, color: ChessColor): [number, number] {
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p?.type === "k" && p.color === color) return [f, r];
    }
  return [4, color === "w" ? 0 : 7];
}

function isAttacked(board: ChessBoard, f: number, r: number, by: ChessColor): boolean {
  // Pawns
  const dir = by === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    const pf = f - df;
    const pr = r - dir;
    if (inBounds(pf, pr)) {
      const p = board[pr][pf];
      if (p?.type === "p" && p.color === by) return true;
    }
  }
  // Knights
  for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
    if (inBounds(f + df, r + dr)) {
      const p = board[r + dr][f + df];
      if (p?.type === "n" && p.color === by) return true;
    }
  }
  // Sliders
  const rays: { dirs: [number, number][]; types: ChessPieceType[] }[] = [
    { dirs: [[1, 1], [1, -1], [-1, 1], [-1, -1]], types: ["b", "q"] },
    { dirs: [[1, 0], [-1, 0], [0, 1], [0, -1]], types: ["r", "q"] },
  ];
  for (const { dirs, types } of rays) {
    for (const [df, dr] of dirs) {
      let cf = f + df;
      let cr = r + dr;
      while (inBounds(cf, cr)) {
        const p = board[cr][cf];
        if (p) {
          if (p.color === by && types.includes(p.type)) return true;
          break;
        }
        cf += df;
        cr += dr;
      }
    }
  }
  // King
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      if (inBounds(f + df, r + dr)) {
        const p = board[r + dr][f + df];
        if (p?.type === "k" && p.color === by) return true;
      }
    }
  return false;
}

export function isInCheck(state: ChessGameState, color: ChessColor): boolean {
  const [f, r] = findKing(state.board, color);
  return isAttacked(state.board, f, r, color === "w" ? "b" : "w");
}

function pseudoMoves(state: ChessGameState, f: number, r: number): ChessMove[] {
  const { board, turn, enPassant } = state;
  const piece = board[r][f];
  if (!piece || piece.color !== turn) return [];
  const moves: ChessMove[] = [];
  const add = (tf: number, tr: number, promotion?: ChessPieceType) => {
    if (!inBounds(tf, tr)) return;
    moves.push({ from: [f, r], to: [tf, tr], ...(promotion ? { promotion } : {}) });
  };
  const dir = piece.color === "w" ? 1 : -1;
  if (piece.type === "p") {
    const start = piece.color === "w" ? 1 : 6;
    const promoRank = piece.color === "w" ? 7 : 0;
    if (inBounds(f, r + dir) && !board[r + dir][f]) {
      if (r + dir === promoRank) {
        for (const pr of ["q", "r", "b", "n"] as const) add(f, r + dir, pr);
      } else {
        add(f, r + dir);
        if (r === start && !board[r + 2 * dir][f]) add(f, r + 2 * dir);
      }
    }
    for (const df of [-1, 1]) {
      if (!inBounds(f + df, r + dir)) continue;
      const target = board[r + dir][f + df];
      if (target && target.color !== piece.color) {
        if (r + dir === promoRank) {
          for (const pr of ["q", "r", "b", "n"] as const) add(f + df, r + dir, pr);
        } else {
          add(f + df, r + dir);
        }
      }
      if (enPassant && enPassant[0] === f + df && enPassant[1] === r + dir) {
        add(f + df, r + dir);
      }
    }
  } else if (piece.type === "n") {
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      if (!inBounds(f + df, r + dr)) continue;
      const t = board[r + dr][f + df];
      if (!t || t.color !== piece.color) add(f + df, r + dr);
    }
  } else if (piece.type === "k") {
    for (let df = -1; df <= 1; df++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        if (!inBounds(f + df, r + dr)) continue;
        const t = board[r + dr][f + df];
        if (!t || t.color !== piece.color) add(f + df, r + dr);
      }
    // Castling
    const home = piece.color === "w" ? 0 : 7;
    const enemy = piece.color === "w" ? "b" : "w";
    if (r === home && f === 4) {
      const canK = piece.color === "w" ? state.castling.wK : state.castling.bK;
      const canQ = piece.color === "w" ? state.castling.wQ : state.castling.bQ;
      if (canK && !board[home][5] && !board[home][6]) {
        const rook = board[home][7];
        if (rook?.type === "r" && rook.color === piece.color) {
          if (
            !isAttacked(board, 4, home, enemy) &&
            !isAttacked(board, 5, home, enemy) &&
            !isAttacked(board, 6, home, enemy)
          ) {
            add(6, home);
          }
        }
      }
      if (canQ && !board[home][3] && !board[home][2] && !board[home][1]) {
        const rook = board[home][0];
        if (rook?.type === "r" && rook.color === piece.color) {
          if (
            !isAttacked(board, 4, home, enemy) &&
            !isAttacked(board, 3, home, enemy) &&
            !isAttacked(board, 2, home, enemy)
          ) {
            add(2, home);
          }
        }
      }
    }
  } else {
    const dirs: [number, number][] =
      piece.type === "b"
        ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : piece.type === "r"
          ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
          : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [df, dr] of dirs) {
      let cf = f + df;
      let cr = r + dr;
      while (inBounds(cf, cr)) {
        const t = board[cr][cf];
        if (!t) add(cf, cr);
        else {
          if (t.color !== piece.color) add(cf, cr);
          break;
        }
        cf += df;
        cr += dr;
      }
    }
  }
  return moves;
}

export function applyMove(state: ChessGameState, move: ChessMove): ChessGameState {
  const board = cloneBoard(state.board);
  const [ff, fr] = move.from;
  const [tf, tr] = move.to;
  const piece = board[fr][ff];
  if (!piece) return state;
  // En passant capture
  if (
    piece.type === "p" &&
    state.enPassant &&
    tf === state.enPassant[0] &&
    tr === state.enPassant[1] &&
    !board[tr][tf]
  ) {
    board[fr][tf] = null;
  }
  board[tr][tf] = move.promotion ? { type: move.promotion, color: piece.color } : piece;
  board[fr][ff] = null;
  // Castling rook
  if (piece.type === "k" && Math.abs(tf - ff) === 2) {
    const home = piece.color === "w" ? 0 : 7;
    if (tf === 6) {
      board[home][5] = board[home][7];
      board[home][7] = null;
    } else {
      board[home][3] = board[home][0];
      board[home][0] = null;
    }
  }
  const castling = { ...state.castling };
  if (piece.type === "k") {
    if (piece.color === "w") {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  if (piece.type === "r") {
    if (ff === 0 && fr === 0) castling.wQ = false;
    if (ff === 7 && fr === 0) castling.wK = false;
    if (ff === 0 && fr === 7) castling.bQ = false;
    if (ff === 7 && fr === 7) castling.bK = false;
  }
  if (tf === 0 && tr === 0) castling.wQ = false;
  if (tf === 7 && tr === 0) castling.wK = false;
  if (tf === 0 && tr === 7) castling.bQ = false;
  if (tf === 7 && tr === 7) castling.bK = false;
  const dir = piece.color === "w" ? 1 : -1;
  const enPassant: [number, number] | null =
    piece.type === "p" && tr - fr === 2 * dir ? [ff, fr + dir] : null;
  return {
    board,
    turn: state.turn === "w" ? "b" : "w",
    castling,
    enPassant,
    halfmove: piece.type === "p" || board[tr][tf] ? 0 : state.halfmove + 1,
  };
}

/** All legal moves for side to move (check-filtered). */
export function legalMoves(state: ChessGameState): ChessMove[] {
  const out: ChessMove[] = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f];
      if (!p || p.color !== state.turn) continue;
      for (const m of pseudoMoves(state, f, r)) {
        const next = applyMove(state, m);
        if (!isInCheck(next, state.turn)) out.push(m);
      }
    }
  return out;
}

export function legalMovesFrom(state: ChessGameState, f: number, r: number): ChessMove[] {
  const out: ChessMove[] = [];
  for (const m of pseudoMoves(state, f, r)) {
    const next = applyMove(state, m);
    if (!isInCheck(next, state.turn)) out.push(m);
  }
  return out;
}

export function squareName(f: number, r: number): string {
  return `${"abcdefgh"[f]}${r + 1}`;
}

/**
 * Replay a persisted move line into board history. Stops at the first illegal
 * move so corrupt saves degrade to the last good position instead of crashing.
 */
export function replayChessMoves(moves: ChessMove[]): ChessGameState[] {
  const history: ChessGameState[] = [initialChessState()];
  for (const m of moves) {
    const state = history[history.length - 1]!;
    const legal = legalMovesFrom(state, m.from[0], m.from[1]).some(
      (c) =>
        c.to[0] === m.to[0] && c.to[1] === m.to[1] && (c.promotion ?? "q") === (m.promotion ?? "q"),
    );
    if (!legal) break;
    history.push(applyMove(state, m));
  }
  return history;
}
