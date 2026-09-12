import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile, Img } from "remotion";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const CaideLogoMark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const scale = interpolate(logoSpring, [0, 1], [0.8, 1]);
  const opacity = interpolate(logoSpring, [0, 0.4, 1], [0, 0.9, 1]);
  const glowPulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.85, 1.2]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: CAIDE_THEME.typography.fontFamily,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {/* Brand Icon with Radiant Glow */}
      <div style={{ position: "relative", marginBottom: "28px" }}>
        {/* Pulsing Backlight */}
        <div
          style={{
            position: "absolute",
            inset: -30,
            background: "radial-gradient(circle, rgba(99, 102, 241, 0.45) 0%, rgba(6, 182, 212, 0.2) 40%, transparent 70%)",
            filter: "blur(30px)",
            transform: `scale(${glowPulse})`,
            zIndex: 0,
          }}
        />

        <div
          style={{
            width: "110px",
            height: "110px",
            borderRadius: "28px",
            backgroundColor: "#121216",
            border: "1.5px solid rgba(255, 255, 255, 0.15)",
            boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 40px ${CAIDE_THEME.colors.primaryGlow}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile("app-icons/icon-group-600-macos.png")}
            style={{ width: "90px", height: "90px", objectFit: "contain" }}
          />
        </div>
      </div>

      {/* Brand Name */}
      <h1
        style={{
          fontSize: "64px",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          margin: 0,
          marginBottom: "12px",
          color: "#ffffff",
          textShadow: "0 0 40px rgba(255, 255, 255, 0.3)",
        }}
      >
        CAIDE
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: "22px",
          fontWeight: 600,
          color: "#c7d2fe",
          margin: 0,
          marginBottom: "28px",
          letterSpacing: "-0.01em",
          textShadow: "0 0 20px rgba(99, 102, 241, 0.4)",
        }}
      >
        The World's Best AI App Builder
      </p>

      {/* Framework Support Badges */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        {[
          { label: "React Native (iOS & Android)", icon: "framework-icons/react-native.png" },
          { label: "Flutter Mobile", icon: "framework-icons/flutter.png" },
          { label: "Web Applications", icon: "framework-icons/website.png" },
        ].map((badge) => (
          <div
            key={badge.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "100px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${CAIDE_THEME.colors.border}`,
              fontSize: "13px",
              fontWeight: 500,
              color: CAIDE_THEME.colors.mutedForeground,
              backdropFilter: "blur(12px)",
            }}
          >
            <Img src={staticFile(badge.icon)} style={{ width: "16px", height: "16px", objectFit: "contain" }} />
            <span>{badge.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
