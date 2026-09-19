// FILE: Scene03SettingsEngine.tsx
// Purpose: Scene 3 — Under the hood: Caide's Provider Routing, Databases & MCP
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CaideSettings } from "../components/CaideSettings";
import { MouseCursor } from "../components/MouseCursor";

export const Scene03SettingsEngine: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 240], [0.94, 0.97]);

  // Cursor moves to OpenCode Zen gateway (X: 830, Y: 460) then to Neon PostgreSQL (X: 1040, Y: 620)
  const cursorX = interpolate(frame, [10, 45, 70, 95, 120], [500, 830, 830, 1040, 1040], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [10, 45, 70, 95, 120], [500, 460, 460, 620, 620], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClick1 = frame >= 48 && frame <= 55;
  const isClick2 = frame >= 98 && frame <= 105;
  const isClicking = isClick1 || isClick2;

  // Feature banner fade
  const bannerOpacity = interpolate(frame, [10, 35, 140, 160], [0, 1, 1, 0]);
  const bannerY = interpolate(frame, [10, 35], [20, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#060606" }}>
      <BackgroundGlow intensity={1.1} />

      {/* Caide Desktop App Window with Settings Modal */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
        }}
      >
        <CaideWindowShell showSettingsModal={true} />

        {/* Modal Backdrop & Authentic Caide Settings Dialog */}
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
          <CaideSettings />
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
          <span style={{ color: "#6073cc" }}>●</span>
          <span>Dyad Engine · OpenCode Zen/Go · Supabase & Neon · Autonomous MCP</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
