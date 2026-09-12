// FILE: Scene01Hook.tsx
// Purpose: Scene 1 — Cinematic introduction of the Caide desktop application
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CAIDE_THEME } from "../constants/theme";

export const Scene01Hook: React.FC = () => {
  const frame = useCurrentFrame();

  // Camera glide and scale
  const scale = interpolate(frame, [0, 240], [0.88, 0.96]);
  const translateY = interpolate(frame, [0, 240], [40, 0]);
  const opacity = interpolate(frame, [0, 30], [0, 1]);

  // Title typography fade in and out
  const titleOpacity = interpolate(frame, [15, 45, 190, 230], [0, 1, 1, 0]);
  const titleY = interpolate(frame, [15, 45], [20, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.1} />

      {/* Floating Caide Desktop App Window */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${translateY}px) scale(${scale})`,
          opacity,
        }}
      >
        <CaideWindowShell />
      </AbsoluteFill>

      {/* Cinematic Title Overlay at the beginning */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            padding: "24px 40px",
            borderRadius: "20px",
            backgroundColor: "rgba(14, 14, 14, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            fontFamily: CAIDE_THEME.typography.fontFamily,
          }}
        >
          <h1
            style={{
              fontSize: "44px",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              margin: 0,
              color: "#ffffff",
            }}
          >
            The World's Best AI App Builder.
          </h1>
          <p
            style={{
              fontSize: "18px",
              color: CAIDE_THEME.colors.mutedForeground,
              margin: 0,
              fontWeight: 500,
            }}
          >
            React Native · Flutter · Web · Blank
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
