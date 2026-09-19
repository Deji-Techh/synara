// FILE: CaideLogoMark.tsx
// Purpose: Authentic, Apple/Linear-grade Caide mark and branding finale
// Layer: Video brand asset

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

  const scale = interpolate(logoSpring, [0, 1], [0.85, 1]);
  const opacity = interpolate(logoSpring, [0, 0.4, 1], [0, 0.9, 1]);

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
      {/* Brand Icon */}
      <div style={{ position: "relative", marginBottom: "24px" }}>
        {/* Subtle white ambient glow */}
        <div
          style={{
            position: "absolute",
            inset: -20,
            background: "radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, transparent 70%)",
            filter: "blur(24px)",
            zIndex: 0,
          }}
        />

        <div
          style={{
            width: "96px",
            height: "96px",
            borderRadius: "24px",
            backgroundColor: "#161616",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile("app-icons/default.png")}
            style={{ width: "80px", height: "80px", objectFit: "contain" }}
          />
        </div>
      </div>

      {/* Brand Name */}
      <h1
        style={{
          fontSize: "56px",
          fontWeight: 800,
          letterSpacing: "-0.035em",
          margin: 0,
          marginBottom: "8px",
          color: "#ffffff",
        }}
      >
        CAIDE
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: "20px",
          fontWeight: 500,
          color: CAIDE_THEME.colors.mutedForeground,
          margin: 0,
          marginBottom: "24px",
          letterSpacing: "-0.01em",
        }}
      >
        The World's Best AI App Builder
      </p>

      {/* Framework Support Badges */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {[
          { name: "React Native", icon: "framework-icons/react-native.png" },
          { name: "Flutter", icon: "framework-icons/flutter.png" },
          { name: "Website", icon: "framework-icons/website.png" },
          { name: "Blank", icon: null },
        ].map((fw) => (
          <div
            key={fw.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "100px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "12px",
              fontWeight: 500,
              color: "#ffffff",
            }}
          >
            {fw.icon ? (
              <Img src={staticFile(fw.icon)} style={{ width: "14px", height: "14px" }} />
            ) : (
              <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>
                ✦
              </span>
            )}
            <span>{fw.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
