import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { KineticText } from "../components/KineticText";
import { CAIDE_THEME } from "../constants/theme";

export const Scene01Hook: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20, 180, 210], [0, 1, 1, 0]);
  const subOpacity = interpolate(frame, [40, 65, 180, 210], [0, 1, 1, 0]);

  // Camera zoom
  const zoom = interpolate(frame, [0, 240], [0.95, 1.08]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.2} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${zoom})`,
          padding: "0 80px",
        }}
      >
        <div style={{ opacity: titleOpacity, marginBottom: "20px" }}>
          <KineticText
            text="Software creation has been fractured."
            fontSize={64}
            fontWeight={800}
            gradient
            delay={10}
            stagger={4}
          />
        </div>

        <div style={{ opacity: subOpacity, maxWidth: "720px" }}>
          <p
            style={{
              fontSize: "24px",
              color: CAIDE_THEME.colors.mutedForeground,
              textAlign: "center",
              fontFamily: CAIDE_THEME.typography.fontFamily,
              lineHeight: 1.5,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Web, iOS, Android, and Backend trapped in isolated silos.
            <br />
            <span style={{ color: "#a5b4fc", fontWeight: 600 }}>Until today.</span>
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
