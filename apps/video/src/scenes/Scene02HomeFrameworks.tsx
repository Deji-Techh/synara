// FILE: Scene02HomeFrameworks.tsx
// Purpose: Scene 2 — Exact CreateAppDialog flow with lifelike mouse cursor navigation
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CaideAppDialog } from "../components/CaideAppDialog";
import { MouseCursor } from "../components/MouseCursor";
import { KineticText } from "../components/KineticText";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene02HomeFrameworks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Natural mouse cursor movement across the screen
  // 1. Move to React Native card (X: 840, Y: 550) from frame 15 to 45
  // 2. Click at frame 50
  // 3. Move to "Create App" button (X: 1140, Y: 685) from frame 60 to 90
  // 4. Click at frame 95
  const cursorX = interpolate(frame, [0, 15, 45, 60, 90, 120], [300, 450, 840, 840, 1140, 1140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [0, 15, 45, 60, 90, 120], [500, 520, 550, 550, 685, 685], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClick1 = frame >= 48 && frame <= 56;
  const isClick2 = frame >= 92 && frame <= 100;
  const isClicking = isClick1 || isClick2;

  // Selected framework card turns active white at frame 50
  const selectedFrameworkIndex = frame >= 50 ? 1 : 0;

  // Overlay callout title animation
  const bannerOpacity = interpolate(frame, [10, 35, 140, 160], [0, 1, 1, 0]);
  const bannerY = interpolate(frame, [10, 35], [20, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#060606" }}>
      <BackgroundGlow intensity={1.1} />

      {/* Main Caide Desktop Window */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "scale(0.95)",
        }}
      >
        <CaideWindowShell />

        {/* Modal Backdrop & Authentic CreateAppDialog */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <CaideAppDialog selectedFrameworkIndex={selectedFrameworkIndex} />
        </div>

        {/* Realistic macOS Mouse Cursor */}
        <MouseCursor
          x={cursorX}
          y={cursorY}
          isClicking={isClicking}
          visible={frame >= 10 && frame <= 130}
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
          <span style={{ color: "#34d399" }}>●</span>
          <span>4 Immutable Frameworks · React Native, Flutter, Website & Blank</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
