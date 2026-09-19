// FILE: Scene06Finale.tsx
// Purpose: Scene 6 — Grand finale: full app perspective pull-back and clean brand mark
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CaideLogoMark } from "../components/CaideLogoMark";
import { CAIDE_THEME } from "../constants/theme";

export const Scene06Finale: React.FC = () => {
  const frame = useCurrentFrame();

  // Background window pulls back and softens
  const windowScale = interpolate(frame, [0, 240], [0.94, 0.84]);
  const windowOpacity = interpolate(frame, [0, 40, 200, 240], [0.8, 0.35, 0.35, 0]);

  // Brand mark descends into focus
  const brandOpacity = interpolate(frame, [30, 60], [0, 1]);
  const brandY = interpolate(frame, [30, 60], [20, 0]);

  // CTA button appears
  const ctaOpacity = interpolate(frame, [60, 90], [0, 1]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.2} />

      {/* Receding Desktop App Window in Background */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${windowScale})`,
          opacity: windowOpacity,
          filter: "blur(2px)",
        }}
      >
        <CaideWindowShell
          showPreviewStage={true}
          previewStageProgress={1}
          composerTypedProgress={1}
          isAgentRunning={true}
          completedToolsCount={4}
        />
      </AbsoluteFill>

      {/* Foreground Brand Mark and CTA */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "32px",
          opacity: brandOpacity,
          transform: `translateY(${brandY}px)`,
        }}
      >
        <CaideLogoMark />

        {/* CTA Button — exact prominent variant from Caide (white background, black text) */}
        <div
          style={{
            opacity: ctaOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              padding: "14px 32px",
              borderRadius: "100px",
              backgroundColor: "#ffffff",
              color: "#0e0e0e",
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: CAIDE_THEME.typography.fontFamily,
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              letterSpacing: "-0.01em",
            }}
          >
            <span>Start Building Today</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <span
            style={{
              fontSize: "12px",
              color: CAIDE_THEME.colors.subtleForeground,
              fontFamily: CAIDE_THEME.typography.fontFamily,
            }}
          >
            Available on macOS, Linux & Windows · Open Source
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
