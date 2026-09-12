// FILE: Scene04PillComposer.tsx
// Purpose: Scene 4 — Authentic Pill Composer typing and autonomous tool execution
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";

export const Scene04PillComposer: React.FC = () => {
  const frame = useCurrentFrame();

  // Camera zoom focused on workspace
  const scale = interpolate(frame, [0, 240], [1.02, 1.06]);
  const translateY = interpolate(frame, [0, 240], [30, 10]);

  // Typing progress (0 to 1 between frame 15 and 80)
  const typingProgress = interpolate(frame, [15, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Agent execution starts at frame 90
  const isAgentRunning = frame >= 90;

  // Completed tools count (0 to 4)
  const completedCount = Math.min(
    4,
    Math.max(0, Math.floor((frame - 105) / 25))
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
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
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
