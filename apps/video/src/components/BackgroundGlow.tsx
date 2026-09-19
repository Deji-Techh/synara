// FILE: BackgroundGlow.tsx
// Purpose: Minimalist ambient dark studio background with subtle neutral lighting
// Layer: Video background

import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";

interface BackgroundGlowProps {
  intensity?: number;
}

export const BackgroundGlow: React.FC<BackgroundGlowProps> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();

  const glowX = interpolate(Math.sin(frame * 0.015), [-1, 1], [40, 60]);
  const glowY = interpolate(Math.cos(frame * 0.012), [-1, 1], [35, 55]);
  const pulse = interpolate(Math.sin(frame * 0.04), [-1, 1], [0.92, 1.08]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: CAIDE_THEME.colors.shellBg,
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      {/* Studio Radial Ambient Highlight */}
      <div
        style={{
          position: "absolute",
          left: `${glowX}%`,
          top: `${glowY}%`,
          width: "900px",
          height: "900px",
          transform: `translate(-50%, -50%) scale(${pulse * intensity})`,
          background:
            "radial-gradient(circle, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 45%, transparent 70%)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle Studio Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, transparent 50%, rgba(5, 5, 5, 0.85) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
