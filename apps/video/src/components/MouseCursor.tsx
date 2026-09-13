// FILE: MouseCursor.tsx
// Purpose: Authentic macOS-style mouse cursor with smooth gliding and click animations
// Layer: Video presentation component

import React from "react";

interface MouseCursorProps {
  x: number;
  y: number;
  isClicking?: boolean;
  visible?: boolean;
  size?: number;
}

export const MouseCursor: React.FC<MouseCursorProps> = ({
  x,
  y,
  isClicking = false,
  visible = true,
  size = 24,
}) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        pointerEvents: "none",
        zIndex: 9999,
        transform: `translate(-3px, -3px) ${isClicking ? "scale(0.82)" : "scale(1)"}`,
        transition: "transform 0.08s cubic-bezier(0.16, 1, 0.3, 1)",
        filter: "drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55))",
      }}
    >
      {/* Tactile Click Ripple Effect */}
      {isClicking && (
        <div
          style={{
            position: "absolute",
            left: "-10px",
            top: "-10px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid rgba(255, 255, 255, 0.8)",
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* High-fidelity macOS Pointer SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 3L11.5 21L14.5 13.5L22 10.5L4 3Z"
          fill="#ffffff"
          stroke="#000000"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
