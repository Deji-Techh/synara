// FILE: GameShell.tsx
// Purpose: Floating draggable + resizable game-break window (portal to body).
// Layer: UI game components

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuSettings, LuX, LuMinus, LuMaximize2 } from "react-icons/lu";

import { GameSettings } from "./GameSettings";
import { useGameShellStore } from "./gameShellStore";
import { GAME_META } from "./gameTypes";
import { cn } from "~/lib/utils";

const ChessBoard = lazy(() => import("./ChessBoard").then((m) => ({ default: m.ChessBoard })));
const SnakeGame = lazy(() => import("./SnakeGame").then((m) => ({ default: m.SnakeGame })));

const MIN = { w: 320, h: 420 };
const MARGIN = 12;

function clampPos(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - 200)),
    y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - 80)),
  };
}

export function GameShellRoot() {
  const open = useGameShellStore((s) => s.open);
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(<GameShell />, document.body);
}

function GameShell() {
  const game = useGameShellStore((s) => s.game);
  const minimized = useGameShellStore((s) => s.minimized);
  const pos = useGameShellStore((s) => s.pos);
  const size = useGameShellStore((s) => s.size);
  const setPos = useGameShellStore((s) => s.setPos);
  const setSize = useGameShellStore((s) => s.setSize);
  const close = useGameShellStore((s) => s.close);
  const toggleMinimized = useGameShellStore((s) => s.toggleMinimized);
  const openGame = useGameShellStore((s) => s.openGame);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  const onDragMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos(clampPos(d.ox + (e.clientX - d.sx), d.oy + (e.clientY - d.sy)));
    },
    [setPos],
  );
  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onDragMove]);

  const onResizeMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      setSize({
        w: Math.max(MIN.w, Math.min(window.innerWidth - MARGIN * 2, r.ow + (e.clientX - r.sx))),
        h: Math.max(MIN.h, Math.min(window.innerHeight - MARGIN * 2, r.oh + (e.clientY - r.sy))),
      });
    },
    [setSize],
  );
  const endResize = useCallback(() => {
    resizeRef.current = null;
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", endResize);
  }, [onResizeMove]);

  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointermove", onResizeMove);
    },
    [onDragMove, onResizeMove],
  );

  // Esc minimizes; global shortcuts stay untouched otherwise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !settingsOpen) toggleMinimized();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, toggleMinimized]);

  const clamped = clampPos(pos.x, pos.y);

  return (
    <div
      data-game-shell
      role="dialog"
      aria-label={`${GAME_META[game].title} break window`}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border/60 shadow-2xl outline-none"
      style={{
        left: clamped.x,
        top: clamped.y,
        width: minimized ? 260 : size.w,
        height: minimized ? "auto" : size.h,
        background: "color-mix(in srgb, var(--popover) 96%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header doubles as drag handle. */}
      <div
        className="flex shrink-0 cursor-move touch-none items-center gap-1 border-b border-border/40 px-2 py-1.5"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox: clamped.x, oy: clamped.y };
          window.addEventListener("pointermove", onDragMove);
          window.addEventListener("pointerup", endDrag);
        }}
      >
        <div className="flex gap-1" role="tablist" aria-label="Pick game">
          {(["chess", "snake"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={game === g}
              onClick={() => openGame(g)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                game === g
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {GAME_META[g].title}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Game settings"
            aria-expanded={settingsOpen}
            title="Settings: difficulty, keyboard"
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              settingsOpen && "bg-muted/60 text-foreground",
            )}
          >
            <LuSettings className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleMinimized}
            aria-label={minimized ? "Expand game" : "Minimize game"}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            {minimized ? <LuMaximize2 className="size-3.5" /> : <LuMinus className="size-4" />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close game"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <LuX className="size-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {settingsOpen ? (
            <GameSettings game={game} />
          ) : (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  Loading {GAME_META[game].title}…
                </div>
              }
            >
              {game === "chess" ? <ChessBoard /> : <SnakeGame />}
            </Suspense>
          )}
        </div>
      )}

      {/* Resize handle (bottom-right). */}
      {!minimized && (
        <div
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault();
            resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h };
            window.addEventListener("pointermove", onResizeMove);
            window.addEventListener("pointerup", endResize);
          }}
          className="absolute right-0 bottom-0 size-5 cursor-nwse-resize touch-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--foreground) 35%, transparent) 50%)",
            borderBottomRightRadius: 12,
          }}
        />
      )}
    </div>
  );
}
