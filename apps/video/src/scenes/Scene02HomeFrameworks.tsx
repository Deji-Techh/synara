import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideAppDialog } from "../components/CaideAppDialog";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene02HomeFrameworks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Badge entrance
  const badgeSpring = spring({
    frame: frame - 10,
    fps,
    config: SPRING_SNAPPY,
  });

  const cursorX = interpolate(frame, [30, 75], [640, 305], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [30, 75], [520, 385], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cursorClick = interpolate(frame, [75, 82, 90], [1, 0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isSelected = frame >= 80;

  // Click ripple wave
  const rippleProgress = Math.max(0, frame - 80);
  const rippleScale = interpolate(rippleProgress, [0, 25], [0.3, 2.2], {
    extrapolateRight: "clamp",
  });
  const rippleOpacity = interpolate(rippleProgress, [0, 10, 25], [0.8, 0.4, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.1} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
        }}
      >
        {/* Category Pill Tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            borderRadius: "100px",
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            color: "#a5b4fc",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: CAIDE_THEME.typography.fontFamily,
            transform: `scale(${interpolate(badgeSpring, [0, 1], [0.8, 1])})`,
            opacity: interpolate(badgeSpring, [0, 1], [0, 1]),
          }}
        >
          <span>✦ Multi-Framework AI Runtime</span>
        </div>

        {/* Authentic Caide App Dialog */}
        <CaideAppDialog selectedFrameworkIndex={isSelected ? 0 : 3} />

        {/* Click Ripple Effect */}
        {frame >= 80 && frame <= 110 && (
          <div
            style={{
              position: "absolute",
              left: "305px",
              top: "385px",
              width: "60px",
              height: "60px",
              transform: `translate(-50%, -50%) scale(${rippleScale})`,
              opacity: rippleOpacity,
              borderRadius: "50%",
              border: "2px solid #6366f1",
              backgroundColor: "rgba(99, 102, 241, 0.2)",
              pointerEvents: "none",
              zIndex: 90,
            }}
          />
        )}

        {/* Animated Mouse Pointer */}
        {frame < 120 && (
          <div
            style={{
              position: "absolute",
              left: `${cursorX}px`,
              top: `${cursorY}px`,
              transform: `scale(${cursorClick})`,
              pointerEvents: "none",
              zIndex: 100,
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
                fill="white"
                stroke="#09090b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
