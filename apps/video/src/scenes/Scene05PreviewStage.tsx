// FILE: Scene05PreviewStage.tsx
// Purpose: Scene 5 — Exact 672px PreviewStage expansion and live mobile app interaction
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { SPRING_SMOOTH } from "../constants/timings";

export const Scene05PreviewStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Preview stage slide-in progress (220ms ease-out matching Caide PreviewStage)
  const stageSpring = spring({
    frame: frame - 10,
    fps,
    config: SPRING_SMOOTH,
  });

  const previewProgress = interpolate(stageSpring, [0, 1], [0, 1]);

  // Cursor interaction: moves to 1W timeframe pill on device screen
  // Device center is around X=1480, Y=560
  const cursorX = interpolate(frame, [45, 75, 95], [1200, 1445, 1445], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [45, 75, 95], [600, 528, 528], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClick = frame >= 75 && frame <= 85;
  const is1W = frame >= 75;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.1} />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "scale(0.96)",
        }}
      >
        <CaideWindowShell
          showPreviewStage={true}
          previewStageProgress={previewProgress}
          composerTypedProgress={1}
          isAgentRunning={true}
          completedToolsCount={4}
          interactiveDeviceTimeframe={is1W ? "1W" : "1D"}
        />

        {/* Realistic Mouse Cursor clicking on Phone Screen */}
        {frame >= 45 && (
          <div
            style={{
              position: "absolute",
              left: `${cursorX}px`,
              top: `${cursorY}px`,
              pointerEvents: "none",
              zIndex: 100,
              transform: isClick ? "scale(0.85)" : "scale(1)",
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
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
