import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";

interface BackgroundGlowProps {
  intensity?: number;
  hueShift?: number;
}

export const BackgroundGlow: React.FC<BackgroundGlowProps> = ({
  intensity = 1,
  hueShift = 0,
}) => {
  const frame = useCurrentFrame();

  const glowX1 = interpolate(Math.sin(frame * 0.02), [-1, 1], [25, 75]);
  const glowY1 = interpolate(Math.cos(frame * 0.015), [-1, 1], [20, 60]);
  const glowX2 = interpolate(Math.cos(frame * 0.025), [-1, 1], [70, 30]);
  const glowY2 = interpolate(Math.sin(frame * 0.018), [-1, 1], [65, 35]);

  const pulse = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.85, 1.15]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: CAIDE_THEME.colors.bg,
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      {/* Background Perspective Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: 0.6,
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 85%)",
        }}
      />

      {/* Primary Violet Aurora Glow */}
      <div
        style={{
          position: "absolute",
          left: `${glowX1}%`,
          top: `${glowY1}%`,
          width: "700px",
          height: "700px",
          transform: `translate(-50%, -50%) scale(${pulse * intensity})`,
          background: `radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(99, 102, 241, 0.04) 50%, transparent 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Cyan Secondary Accent Glow */}
      <div
        style={{
          position: "absolute",
          left: `${glowX2}%`,
          top: `${glowY2}%`,
          width: "600px",
          height: "600px",
          transform: `translate(-50%, -50%) scale(${pulse * intensity * 0.9})`,
          background: `radial-gradient(circle, rgba(6, 182, 212, 0.14) 0%, rgba(6, 182, 212, 0.03) 45%, transparent 70%)`,
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />

      {/* Vignette Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at center, transparent 40%, rgba(9, 9, 11, 0.8) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
