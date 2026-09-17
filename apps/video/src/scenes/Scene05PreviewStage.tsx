// FILE: Scene05PreviewStage.tsx
// Purpose: Scene 5 — Exact 672px PreviewStage expansion (Ctrl+P) and live interactive mobile app
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { MouseCursor } from "../components/MouseCursor";
import { EASING_SMOOTH } from "../constants/timings";

export const Scene05PreviewStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Preview stage slide-in progress (220ms ease-out matching Caide PreviewStage)
  const stageSpring = spring({
    frame: frame - 8,
    fps,
  });

  const previewProgress = interpolate(stageSpring, [0, 1], [0, 1]);

  // Cursor moves from chat area to the 1W timeframe pill on the mobile preview screen
  // Device screen center is located around X: 1445, Y: 532
  const cursorX = interpolate(frame, [15, 50, 75], [1050, 1445, 1445], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [15, 50, 75], [650, 532, 532], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClick = frame >= 52 && frame <= 60;
  const is1W = frame >= 54;

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
          transform: "scale(0.95)",
        }}
      >
        <CaideWindowShell
          showPreviewStage={true}
          previewStageProgress={previewProgress}
          composerTypedProgress={1}
          isAgentRunning={true}
          completedToolsCount={4}
          showThirdUserMessage={true}
          interactiveDeviceTimeframe={is1W ? "1W" : "1D"}
        />

        {/* Realistic macOS Mouse Cursor clicking on live simulator */}
        <MouseCursor
          x={cursorX}
          y={cursorY}
          isClicking={isClick}
          visible={frame >= 15 && frame <= 110}
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
          <span style={{ color: "#10b981" }}>●</span>
          <span>Fixed 672px Preview Stage (`Ctrl+P`) · Live Hot Reloading & Native Simulator</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
