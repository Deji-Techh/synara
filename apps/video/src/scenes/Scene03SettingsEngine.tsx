import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideSettings } from "../components/CaideSettings";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene03SettingsEngine: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.15} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        }}
      >
        {/* Title Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `translateY(${interpolate(titleSpring, [0, 1], [-20, 0])}px)`,
            opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          }}
        >
          <div
            style={{
              padding: "4px 14px",
              borderRadius: "100px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: CAIDE_THEME.colors.emerald,
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: CAIDE_THEME.typography.fontFamily,
              marginBottom: "8px",
            }}
          >
            ✦ Unrestricted Provider Freedom
          </div>

          <h2
            style={{
              fontSize: "36px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              margin: 0,
              fontFamily: CAIDE_THEME.typography.fontFamily,
            }}
          >
            Direct Provider Routing & Full Stack Databases
          </h2>
        </div>

        {/* Authentic Settings Screen Component */}
        <CaideSettings />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
