// FILE: ChessPieces.tsx
// Purpose: Inline SVG chess pieces (currentColor-aware, theme-friendly, zero assets).
// Layer: UI game components

import type { ChessColor, ChessPieceType } from "./chessEngine";

const PATHS: Record<ChessPieceType, string> = {
  p: "M12 2a2.5 2.5 0 1 1 0 5c-.9 0-1.7-.5-2.1-1.2L7 9.5V11h2v2l-2.5 7h11L15 13v-2h2V9.5l-2.9-3.7c-.4.7-1.2 1.2-2.1 1.2z",
  n: "M7 21l1-7 2-2V7l-1.5-2L14 3l1.5 1L19 8l-1 1 1 4-2 1-1 4h-3l.5-2.5L11 14l-2 1-1 6H7z",
  b: "M12 2l1 2 3 3-1.5 1.5L17 11l-2 1-1 8H9l-1-8-3-2 2.5-2L6 5l3-3 1-1 2 1zm0 5.5A1.5 1.5 0 1 0 12 10a1.5 1.5 0 0 0 0-2.5zM7 20h10v1.5H7V20z",
  r: "M6 2l1 3h2V4h2v1h2V4h2v1h2l1-3 1 8-1 1v9H5v-9L4 10l1-8h1zm1.5 15h7V19h-7v-2z",
  q: "M5 3l1.5 2L9 4l1 2 2-3 2 3 1-2 2.5 1L19 3l-1 5 1 2-3 1-1 8H8l-1-8-3-1 1-2-1-5h1zm2 16h10v1.5H7V19z",
  k: "M11 1h2v3h3v2h-3v2l3 2 1 9H6l1-9 3-2V6H7V4h3V1h1zm-3.5 18h9V20.5h-9V19z",
};

export function ChessPieceGlyph({ type, color }: { type: ChessPieceType; color: ChessColor }) {
  const isWhite = color === "w";
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-full"
      style={{
        fill: isWhite ? "var(--popover-foreground)" : "var(--foreground)",
        stroke: isWhite ? "var(--foreground)" : "var(--popover)",
        strokeWidth: 0.9,
        filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.35))",
      }}
    >
      <path d={PATHS[type]} strokeLinejoin="round" />
    </svg>
  );
}
