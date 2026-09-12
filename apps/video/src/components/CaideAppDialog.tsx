// FILE: CaideAppDialog.tsx
// Purpose: 100% clean carbon copy of Caide's CreateAppDialog (apps/web/src/components/CreateAppDialog.tsx)
// Layer: Video authentic component

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile, Img } from "remotion";
import { CAIDE_THEME, FRAMEWORKS_DATA } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

interface CaideAppDialogProps {
  selectedFrameworkIndex?: number;
  interactiveFrame?: number;
}

export const CaideAppDialog: React.FC<CaideAppDialogProps> = ({
  selectedFrameworkIndex = 1, // React Native
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Dialog entrance animation
  const modalSpring = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const modalScale = interpolate(modalSpring, [0, 1], [0.95, 1]);
  const modalOpacity = interpolate(modalSpring, [0, 0.4, 1], [0, 0.9, 1]);
  const modalY = interpolate(modalSpring, [0, 1], [24, 0]);

  // App name typing animation (starts at frame 30)
  const fullAppName = "wandering-otter";
  const typedChars = Math.min(
    fullAppName.length,
    Math.max(0, Math.floor((frame - 35) * 0.9))
  );
  const displayedAppName = fullAppName.slice(0, typedChars);

  // Framework selection interaction (clicks at frame 75)
  const isFrameworkSelected = frame >= 75 ? selectedFrameworkIndex : 0;

  return (
    <div
      style={{
        width: "520px",
        backgroundColor: "#141414",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: CAIDE_THEME.shadows.dialog,
        padding: "24px",
        color: CAIDE_THEME.colors.foreground,
        fontFamily: CAIDE_THEME.typography.fontFamily,
        transform: `translateY(${modalY}px) scale(${modalScale})`,
        opacity: modalOpacity,
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Header — 100% exact copy of CreateAppDialog.tsx */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h2
          style={{
            fontSize: "17px",
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.015em",
            color: "#ffffff",
          }}
        >
          Create new app
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: CAIDE_THEME.colors.mutedForeground,
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          Choose a framework for{" "}
          <code
            style={{
              padding: "2px 5px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              fontFamily: CAIDE_THEME.typography.fontMono,
              fontSize: "12px",
              color: "#f5f5f5",
            }}
          >
            ~/caide-apps/{displayedAppName || "..."}
          </code>
          . It is fixed for this project and controls preview, tools, and builds.
        </p>
      </div>

      {/* App Name Input Group */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: CAIDE_THEME.colors.foreground,
          }}
        >
          App name
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          <div
            style={{
              flex: 1,
              height: "36px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              fontSize: "13px",
              fontFamily: CAIDE_THEME.typography.fontFamily,
              color: "#ffffff",
            }}
          >
            <span>{displayedAppName}</span>
            {frame < 80 && (
              <span
                style={{
                  display: "inline-block",
                  width: "1.5px",
                  height: "16px",
                  backgroundColor: "#ffffff",
                  marginLeft: "2px",
                  opacity: frame % 30 < 15 ? 1 : 0,
                }}
              />
            )}
          </div>
          <div
            style={{
              height: "36px",
              padding: "0 14px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: "transparent",
              color: CAIDE_THEME.colors.foreground,
              fontSize: "12px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Shuffle
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "11px",
            color: CAIDE_THEME.colors.mutedForeground,
          }}
        >
          <span>
            Folder:{" "}
            <code
              style={{
                padding: "1px 4px",
                borderRadius: "3px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                fontFamily: CAIDE_THEME.typography.fontMono,
              }}
            >
              ~/caide-apps/{displayedAppName || "wandering-otter"}
            </code>
          </span>
          <span style={{ fontFamily: CAIDE_THEME.typography.fontMono, opacity: 0.6 }}>
            {displayedAppName.length}/64
          </span>
        </div>
      </div>

      {/* Framework Section — 2x2 Grid exact copy of Caide */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: CAIDE_THEME.colors.foreground,
          }}
        >
          Framework
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          {FRAMEWORKS_DATA.map((fw, idx) => {
            const isSelected = isFrameworkSelected === idx;

            return (
              <div
                key={fw.id}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "6px",
                  padding: "12px",
                  borderRadius: "12px",
                  backgroundColor: isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.02)",
                  border: isSelected
                    ? "1px solid #ffffff"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  color: isSelected ? "#0e0e0e" : CAIDE_THEME.colors.foreground,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: isSelected
                        ? "rgba(0, 0, 0, 0.08)"
                        : "rgba(255, 255, 255, 0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {fw.icon ? (
                      <Img
                        src={staticFile(fw.icon)}
                        style={{ width: "18px", height: "18px", objectFit: "contain" }}
                      />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 4" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{fw.label}</span>
                </div>

                <span
                  style={{
                    fontSize: "11px",
                    lineHeight: 1.3,
                    color: isSelected ? "rgba(0, 0, 0, 0.7)" : CAIDE_THEME.colors.mutedForeground,
                  }}
                >
                  {fw.description}
                </span>

                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    color: isSelected ? "rgba(0, 0, 0, 0.5)" : CAIDE_THEME.colors.subtleForeground,
                  }}
                >
                  {fw.hint}
                </span>

                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#0e0e0e",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground, margin: 0 }}>
          The selected framework cannot be changed after the project is created.
        </p>
      </div>

      {/* Footer — 100% exact copy of Caide DialogFooter */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "8px",
          marginTop: "4px",
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            fontSize: "12px",
            color: CAIDE_THEME.colors.mutedForeground,
            fontWeight: 500,
          }}
        >
          Cancel
        </div>
        <div
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            backgroundColor: "#ffffff",
            color: "#0e0e0e",
            fontSize: "12px",
            fontWeight: 600,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
            transform: frame >= 100 && frame <= 115 ? "scale(0.96)" : "scale(1)",
          }}
        >
          Create app
        </div>
      </div>
    </div>
  );
};
