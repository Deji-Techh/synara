// FILE: Scene04PillComposer.tsx
// Purpose: Scene 4 — Authentic Pill Composer typing, send button click, and Antigravity tool loop
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { MouseCursor } from "../components/MouseCursor";

export const Scene04PillComposer: React.FC = () => {
  const frame = useCurrentFrame();

  // Camera zoom focused comfortably on the workspace
  const scale = interpolate(frame, [0, 240], [0.98, 1.02]);
  const translateY = interpolate(frame, [0, 240], [20, 0]);

  // Mouse cursor trajectory:
  // 1. Frame 0 -> 12: moves from center of chat (X: 900, Y: 600) to composer textarea (X: 750, Y: 855)
  // 2. Click textarea at frame 12 (focus cursor)
  // 3. Frame 14 -> 72: user types prompt
  // 4. Frame 73 -> 83: cursor moves to purple send button (X: 1195, Y: 885)
  // 5. Click send button at frame 84
  // 6. Frame 88 -> 120: cursor relaxes back slightly
  const cursorX = interpolate(
    frame,
    [0, 12, 72, 83, 100],
    [900, 750, 750, 1195, 1120],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const cursorY = interpolate(
    frame,
    [0, 12, 72, 83, 100],
    [600, 855, 855, 885, 820],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const isClick1 = frame >= 12 && frame <= 18;
  const isClick2 = frame >= 83 && frame <= 90;
  const isClicking = isClick1 || isClick2;

  // Typing progress (0 to 1 between frame 14 and 72)
  const typingProgress = interpolate(frame, [14, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Third user message appears after send click
  const showThirdMessage = frame >= 84;

  // Agent execution begins right after send click
  const isAgentRunning = frame >= 90;

  // Completed tools count (0 to 4)
  const completedCount = Math.min(
    4,
    Math.max(0, Math.floor((frame - 95) / 18))
  );

  // Top feature callout
  const bannerOpacity = interpolate(frame, [8, 30, 150, 170], [0, 1, 1, 0]);
  const bannerY = interpolate(frame, [8, 30], [20, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#060606" }}>
      <BackgroundGlow intensity={1.1} />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${translateY}px) scale(${scale})`,
        }}
      >
        <CaideWindowShell
          composerTypedProgress={typingProgress}
          isAgentRunning={isAgentRunning}
          completedToolsCount={completedCount}
          showThirdUserMessage={showThirdMessage}
        />

        {/* Realistic macOS Mouse Cursor */}
        <MouseCursor
          x={cursorX}
          y={cursorY}
          isClicking={isClicking}
          visible={frame >= 0 && frame <= 110}
        />
      </AbsoluteFill>

      {/* Top Floating Feature Callout */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "0",
          right: "0",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: bannerOpacity,
          transform: `translateY(${bannerY}px)`,
          zIndex: 200,
        }}
      >
        <div
          style={{
            padding: "10px 24px",
            borderRadius: "999px",
            backgroundColor: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
            fontSize: "13px",
            fontWeight: 600,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ color: "#a855f7" }}>●</span>
          <span>Pill Composer & Antigravity Tool Loop · Instant Codebase Generation</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
