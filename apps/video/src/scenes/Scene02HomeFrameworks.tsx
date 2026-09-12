// FILE: Scene02HomeFrameworks.tsx
// Purpose: Scene 2 — Exact CreateAppDialog flow inside Caide desktop window
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CaideAppDialog } from "../components/CaideAppDialog";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene02HomeFrameworks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Natural mouse cursor glide across frameworks
  // Frame 20 -> 75: cursor moves from outside to React Native card (at center-left)
  const cursorX = interpolate(frame, [20, 75, 100, 115], [960, 850, 850, 1150], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [20, 75, 100, 115], [700, 560, 560, 680], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClick1 = frame >= 75 && frame <= 85;
  const isClick2 = frame >= 115 && frame <= 125;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.1} />

      {/* Main Caide Desktop App Window */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "scale(0.96)",
        }}
      >
        <CaideWindowShell />

        {/* Modal Backdrop & Authentic CreateAppDialog */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <CaideAppDialog selectedFrameworkIndex={1} />
        </div>

        {/* Realistic Mouse Cursor */}
        <div
          style={{
            position: "absolute",
            left: `${cursorX}px`,
            top: `${cursorY}px`,
            pointerEvents: "none",
            zIndex: 100,
            transform: isClick1 || isClick2 ? "scale(0.85)" : "scale(1)",
            transition: "transform 0.1s ease",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 3L10.5 21L13.5 13.5L21 10.5L3 3Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
