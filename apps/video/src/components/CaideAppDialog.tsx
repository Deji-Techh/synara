import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile, Img } from "remotion";
import { CAIDE_THEME, FRAMEWORKS_DATA } from "../constants/theme";
import { SPRING_SNAPPY, EASING_CRISP } from "../constants/timings";

interface CaideAppDialogProps {
  selectedFrameworkIndex?: number;
  interactiveFrame?: number;
}

export const CaideAppDialog: React.FC<CaideAppDialogProps> = ({
  selectedFrameworkIndex = 0,
  interactiveFrame = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const modalSpring = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const modalScale = interpolate(modalSpring, [0, 1], [0.92, 1]);
  const modalOpacity = interpolate(modalSpring, [0, 0.5, 1], [0, 0.9, 1]);
  const modalY = interpolate(modalSpring, [0, 1], [40, 0]);

  // App name typing animation
  const typedChars = Math.min(
    15,
    Math.max(0, Math.floor((frame - 30) * 0.8))
  );
  const fullAppName = "wandering-otter";
  const displayedAppName = fullAppName.slice(0, typedChars);

  return (
    <div
      style={{
        width: "820px",
        backgroundColor: "rgba(18, 18, 21, 0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: "20px",
        border: `1px solid ${CAIDE_THEME.colors.border}`,
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        padding: "36px",
        color: CAIDE_THEME.colors.foreground,
        fontFamily: CAIDE_THEME.typography.fontFamily,
        transform: `translateY(${modalY}px) scale(${modalScale})`,
        opacity: modalOpacity,
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: CAIDE_THEME.colors.primary,
                boxShadow: `0 0 12px ${CAIDE_THEME.colors.primary}`,
              }}
            />
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Create your first app
            </h2>
          </div>
          <p style={{ fontSize: "14px", color: CAIDE_THEME.colors.mutedForeground, margin: 0 }}>
            Caide builds complete apps across React Native, Flutter, and Web.
          </p>
        </div>

        {/* Modal close icon / pill badge */}
        <div
          style={{
            padding: "5px 12px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: "100px",
            fontSize: "12px",
            color: CAIDE_THEME.colors.subtleForeground,
            border: `1px solid ${CAIDE_THEME.colors.border}`,
          }}
        >
          v0.9.0
        </div>
      </div>

      {/* App Name Input */}
      <div style={{ marginBottom: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <label style={{ fontSize: "13px", fontWeight: 600, color: CAIDE_THEME.colors.mutedForeground }}>
            App Name
          </label>
          <span style={{ fontSize: "12px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono }}>
            slug: {displayedAppName || "..."}
          </span>
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(9, 9, 11, 0.7)",
            border: `1px solid ${frame > 30 ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.border}`,
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "15px",
            fontFamily: CAIDE_THEME.typography.fontMono,
            boxShadow: frame > 30 ? `0 0 16px ${CAIDE_THEME.colors.primaryGlow}` : "none",
          }}
        >
          <span style={{ color: CAIDE_THEME.colors.foreground }}>{displayedAppName}</span>
          {frame % 30 < 15 && (
            <span
              style={{
                display: "inline-block",
                width: "2px",
                height: "18px",
                backgroundColor: CAIDE_THEME.colors.primary,
                marginLeft: "2px",
              }}
            />
          )}
        </div>
      </div>

      {/* Framework Selector Label */}
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: "13px", fontWeight: 600, color: CAIDE_THEME.colors.mutedForeground }}>
          Framework (Immutable per project)
        </label>
        <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.emerald, fontWeight: 600 }}>
          ● All Native Controls Supported
        </span>
      </div>

      {/* Frameworks Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "14px",
          marginBottom: "28px",
        }}
      >
        {FRAMEWORKS_DATA.map((fw, idx) => {
          const cardSpring = spring({
            frame: frame - (15 + idx * 6),
            fps,
            config: SPRING_SNAPPY,
          });

          const isSelected = idx === selectedFrameworkIndex;
          const cardScale = interpolate(cardSpring, [0, 1], [0.94, 1]);
          const cardOpacity = interpolate(cardSpring, [0, 0.5, 1], [0, 0.8, 1]);

          return (
            <div
              key={fw.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
                padding: "16px",
                backgroundColor: isSelected ? "rgba(99, 102, 241, 0.12)" : "rgba(24, 24, 27, 0.5)",
                border: `1.5px solid ${isSelected ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.border}`,
                borderRadius: "14px",
                opacity: cardOpacity,
                transform: `scale(${cardScale})`,
                boxShadow: isSelected ? `0 8px 24px ${CAIDE_THEME.colors.primaryGlow}` : "none",
                position: "relative",
              }}
            >
              {/* Framework Icon */}
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${CAIDE_THEME.colors.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {fw.icon ? (
                  <Img
                    src={staticFile(fw.icon)}
                    style={{ width: "26px", height: "26px", objectFit: "contain" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "3px",
                      border: `2px dashed ${CAIDE_THEME.colors.mutedForeground}`,
                    }}
                  />
                )}
              </div>

              {/* Text Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: CAIDE_THEME.colors.foreground }}>
                    {fw.label}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "6px",
                      backgroundColor: isSelected ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.06)",
                      color: isSelected ? "#c7d2fe" : CAIDE_THEME.colors.mutedForeground,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {fw.badge}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: CAIDE_THEME.colors.mutedForeground, marginBottom: "4px" }}>
                  {fw.description}
                </div>
                <div style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>
                  {fw.hint}
                </div>
              </div>

              {/* Active Selection Checkmark */}
              {isSelected && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    backgroundColor: CAIDE_THEME.colors.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
        <div
          style={{
            padding: "10px 18px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 500,
            color: CAIDE_THEME.colors.mutedForeground,
          }}
        >
          Cancel
        </div>
        <div
          style={{
            padding: "11px 24px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: CAIDE_THEME.colors.primary,
            color: "#ffffff",
            boxShadow: `0 4px 18px ${CAIDE_THEME.colors.primaryGlow}`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>Create app</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
};
