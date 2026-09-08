// FILE: ChessBoard.tsx
// Purpose: Playable chess vs local AI (click/tap + optional keyboard cursor).
// Layer: UI game components

import { useEffect, useMemo, useRef, useState } from "react";

import { ChessPieceGlyph } from "./ChessPieces";
import {
  applyMove,
  initialChessState,
  isInCheck,
  legalMoves,
  legalMovesFrom,
  squareName,
  type ChessGameState,
  type ChessMove,
} from "./chessEngine";
import { pickAiMove } from "./chessAi";
import { isEditableTarget, isInsideGameShell } from "./gameKeys";
import { useGameShellStore } from "./gameShellStore";
import type { GameDifficulty } from "./gameTypes";

const FILES = "abcdefgh";

export function ChessBoard() {
  const difficulty = useGameShellStore((s) => s.difficulty.chess);
  const keyboardEnabled = useGameShellStore((s) => s.keyboardEnabled);
  const keyMap = useGameShellStore((s) => s.keyMap.chess);
  const [history, setHistory] = useState<ChessGameState[]>([initialChessState()]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [cursor, setCursor] = useState<[number, number]>([4, 1]);
  const [thinking, setThinking] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = history[history.length - 1]!;
  const moves = useMemo(() => legalMoves(state), [state]);
  const status = useMemo(() => chessStatus(state, moves.length), [state, moves.length]);
  const selectedTargets = useMemo(
    () => (selected ? legalMovesFrom(state, selected[0], selected[1]) : []),
    [state, selected],
  );
  const targetSet = useMemo(
    () => new Set(selectedTargets.map((m) => `${m.to[0]},${m.to[1]}`)),
    [selectedTargets],
  );

  const playerTurn = state.turn === "w";

  const doMove = (move: ChessMove) => {
    setHistory((h) => [...h, applyMove(state, move)]);
    setSelected(null);
  };

  const onSquare = (f: number, r: number) => {
    if (!playerTurn || thinking) return;
    const piece = state.board[r][f];
    if (selected) {
      const match = selectedTargets.find((m) => m.to[0] === f && m.to[1] === r);
      if (match) {
        // Auto-queen promotion for speed; manual choice is a follow-up.
        const needsPromo =
          state.board[selected[1]][selected[0]]?.type === "p" && (r === 0 || r === 7);
        doMove(needsPromo && !match.promotion ? { ...match, promotion: "q" } : match);
        return;
      }
    }
    if (piece && piece.color === "w") setSelected([f, r]);
    else setSelected(null);
    setCursor([f, r]);
  };

  // AI replies as black after the player's move settles.
  useEffect(() => {
    if (state.turn !== "b" && moves.length !== 0) return;
    if (moves.length === 0) return;
    setThinking(true);
    aiTimer.current = setTimeout(() => {
      const ai = pickAiMove(state, difficulty as GameDifficulty);
      if (ai) setHistory((h) => [...h, applyMove(state, ai)]);
      setThinking(false);
    }, 320);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  // Optional keyboard cursor — master switch + focus guard so work is never hijacked.
  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!isInsideGameShell(e.target)) return;
      if (isEditableTarget(e.target)) return;
      const k = e.key;
      const want = (action: string) => keyMap[action]?.key === k;
      let [cf, cr] = cursor;
      if (want("up")) cr = Math.min(7, cr + 1);
      else if (want("down")) cr = Math.max(0, cr - 1);
      else if (want("left")) cf = Math.max(0, cf - 1);
      else if (want("right")) cf = Math.min(7, cf + 1);
      else if (want("select")) {
        e.preventDefault();
        onSquare(cursor[0], cursor[1]);
        return;
      } else if (want("undo")) {
        e.preventDefault();
        undo();
        return;
      } else if (want("newGame")) {
        e.preventDefault();
        reset();
        return;
      } else return;
      e.preventDefault();
      setCursor([cf, cr]);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardEnabled, keyMap, cursor, state, selected, thinking]);

  const undo = () => {
    setHistory((h) => (h.length > 2 ? h.slice(0, -2) : [initialChessState()]));
    setSelected(null);
  };
  const reset = () => {
    setHistory([initialChessState()]);
    setSelected(null);
    setCursor([4, 1]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span aria-live="polite">
          {thinking ? "AI thinking…" : status}
          <span className="ml-2 opacity-70">vs {difficulty}</span>
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            className="rounded px-2 py-1 hover:bg-muted/50 hover:text-foreground"
          >
            Undo
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
        role="grid"
        aria-label="Chess board, you play white vs AI"
        className="grid aspect-square w-full min-h-0 grid-cols-8 overflow-hidden rounded-lg border border-border/60"
      >
        {/* Render rank 8 → 1 so orientation matches a real board. */}
        {Array.from({ length: 8 }, (_, displayRank) => 7 - displayRank).map((r) =>
          Array.from({ length: 8 }, (_, f) => {
            const piece = state.board[r][f];
            const light = (f + r) % 2 === 1;
            const isSel = selected?.[0] === f && selected?.[1] === r;
            const isCursor = cursor[0] === f && cursor[1] === r;
            const isTarget = targetSet.has(`${f},${r}`);
            return (
              <button
                key={`${f}-${r}`}
                type="button"
                role="gridcell"
                aria-label={`${squareName(f, r)}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}
                onClick={() => onSquare(f, r)}
                className="relative flex items-center justify-center p-[6%] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  background: light
                    ? "color-mix(in srgb, var(--primary) 10%, var(--popover))"
                    : "color-mix(in srgb, var(--foreground) 20%, var(--popover))",
                  boxShadow: isSel
                    ? "inset 0 0 0 2px var(--primary)"
                    : isCursor && keyboardEnabled
                      ? "inset 0 0 0 1px var(--ring)"
                      : undefined,
                }}
              >
                {f === 0 && (
                  <span className="absolute top-0.5 left-1 text-[9px] opacity-60">{r + 1}</span>
                )}
                {r === 0 && (
                  <span className="absolute right-1 bottom-0.5 text-[9px] opacity-60">
                    {FILES[f]}
                  </span>
                )}
                {piece && <ChessPieceGlyph type={piece.type} color={piece.color} />}
                {isTarget && (
                  <span
                    className="absolute size-2.5 rounded-full"
                    style={{ background: "color-mix(in srgb, var(--primary) 75%, transparent)" }}
                  />
                )}
              </button>
            );
          }),
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        {keyboardEnabled
          ? "Keys active while this window is focused. Toggle off in gear settings to never intercept typing."
          : "Mouse/touch only — keyboard control is off."}
      </p>
    </div>
  );
}

function chessStatus(state: ChessGameState, moveCount: number): string {
  if (moveCount === 0) {
    return isInCheck(state, state.turn)
      ? state.turn === "w"
        ? "Checkmate — AI wins"
        : "Checkmate — you win!"
      : "Stalemate — draw";
  }
  if (isInCheck(state, state.turn)) return state.turn === "w" ? "Check — your move" : "Check — AI to move";
  return state.turn === "w" ? "Your move (white)" : "AI move (black)";
}
