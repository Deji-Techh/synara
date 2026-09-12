import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideLogoMark } from "../components/CaideLogoMark";
import { CAIDE_THEME } from "../constants/theme";

export const Scene06Finale: React.FC = () => {
  const frame = useCurrentFrame();

  const zoom = interpolate(frame, [0, 240], [0.94, 1.05]);
  const ctaOpacity = interpolate(frame, [60, 90], [0, 1]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.5} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${zoom})`,
          gap: "36px",
        }}
      >
        <CaideLogoMark />

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "16px 36px",
              borderRadius: "100px",
              backgroundColor: "#ffffff",
              color: "#09090b",
              fontSize: "17px",
              fontWeight: 700,
              fontFamily: CAIDE_THEME.typography.fontFamily,
              boxShadow: "0 10px 40px rgba(255, 255, 255, 0.3), 0 0 50px rgba(99, 102, 241, 0.4)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              letterSpacing: "-0.01em",
            }}
          >
            <span>Start Building Today</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <span
            style={{
              fontSize: "13px",
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
