// FILE: Scene01Hook.tsx
// Purpose: Scene 1 — Cinematic Apple-grade hook introducing Caide
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { KineticText } from "../components/KineticText";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene01Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera 3D-like glide and scale
  const windowSpring = spring({
    frame: frame - 10,
    fps,
    config: SPRING_SNAPPY,
  });

  const scale = interpolate(windowSpring, [0, 1], [0.86, 0.94]);
  const translateY = interpolate(windowSpring, [0, 1], [60, 10]);
  const windowOpacity = interpolate(frame, [0, 25], [0, 1]);

  // Title typography fade and exit
  const titleOpacity = interpolate(frame, [10, 40, 180, 220], [0, 1, 1, 0]);
  const titleTranslateY = interpolate(frame, [10, 40, 180, 220], [30, 0, 0, -20]);

  // Subtitle fade
  const subOpacity = interpolate(frame, [45, 75, 180, 220], [0, 1, 1, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#060606" }}>
      <BackgroundGlow intensity={1.2} />

      {/* Floating Caide Desktop Window with Authentic UI */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${translateY}px) scale(${scale})`,
          opacity: windowOpacity,
        }}
      >
        <CaideWindowShell />
      </AbsoluteFill>

      {/* Cinematic Glass Overlay Header */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
          zIndex: 100,
        }}
      >
        <div
          style={{
            padding: "26px 48px",
            borderRadius: "22px",
            backgroundColor: "rgba(10, 10, 10, 0.88)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 30px 80px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            fontFamily: CAIDE_THEME.typography.fontFamily,
          }}
        >
          {/* Eyebrow badge */}
          <div
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#a5b4fc",
            }}
          >
            Introducing New Caide
          </div>

          <KineticText
            text="The World's Best AI App Builder."
            fontSize={46}
            fontWeight={800}
            delay={15}
            stagger={3}
            gradient={true}
          />

          <div
            style={{
              opacity: subOpacity,
              fontSize: "16px",
              fontWeight: 500,
              color: "#999999",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>React Native</span>
            <span style={{ color: "#444444" }}>·</span>
            <span>Flutter</span>
            <span style={{ color: "#444444" }}>·</span>
            <span>Website</span>
            <span style={{ color: "#444444" }}>·</span>
            <span>Blank</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
