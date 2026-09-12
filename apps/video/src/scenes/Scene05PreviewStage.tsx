import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideDevice } from "../components/CaideDevice";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene05PreviewStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftSpring = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const leftX = interpolate(leftSpring, [0, 1], [-40, 0]);
  const leftOpacity = interpolate(leftSpring, [0, 0.4, 1], [0, 0.8, 1]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.35} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: "60px",
          padding: "0 80px",
        }}
      >
        {/* Left Side: Real-Time Diff & Agent Activity Inspector */}
        <div
          style={{
            width: "480px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            transform: `translateX(${leftX}px)`,
            opacity: leftOpacity,
            fontFamily: CAIDE_THEME.typography.fontFamily,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "100px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: CAIDE_THEME.colors.emerald,
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              width: "fit-content",
            }}
          >
            <span>● 0-Latency Hot Module Reload</span>
          </div>

          <h2
            style={{
              fontSize: "44px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            See your code run live. Instantaneously.
          </h2>

          <p
            style={{
              fontSize: "17px",
              color: CAIDE_THEME.colors.mutedForeground,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Native device chassis for mobile apps, responsive desktop canvas for websites.
            Interact with touch gestures, live database queries, and instant APK export.
          </p>

          {/* Quick Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "14px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                backgroundColor: "rgba(24, 24, 27, 0.6)",
                border: `1px solid ${CAIDE_THEME.colors.border}`,
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#a5b4fc" }}>0.8s</div>
              <div style={{ fontSize: "12px", color: CAIDE_THEME.colors.subtleForeground }}>Full Scaffold to Screen</div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                backgroundColor: "rgba(24, 24, 27, 0.6)",
                border: `1px solid ${CAIDE_THEME.colors.border}`,
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, color: CAIDE_THEME.colors.emerald }}>100%</div>
              <div style={{ fontSize: "12px", color: CAIDE_THEME.colors.subtleForeground }}>Native Component Accuracy</div>
            </div>
          </div>
        </div>

        {/* Right Side: Authentic PreviewStage Device Frame */}
        <div>
          <CaideDevice />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
