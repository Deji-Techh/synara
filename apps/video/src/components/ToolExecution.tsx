import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const ToolExecution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const toolItems = [
    {
      title: "Scaffold React Native (Expo) Architecture",
      badge: "create_workspace",
      time: "0.4s",
      icon: "📁",
    },
    {
      title: "Generate Neon PostgreSQL Database Tables & Branch",
      badge: "neon_migrate",
      time: "0.6s",
      icon: "⚡",
    },
    {
      title: "Render Live Candlestick Graph & Touch Gesture Component",
      badge: "write_file",
      time: "0.9s",
      icon: "✨",
    },
    {
      title: "Compile HMR Bundle to Preview Stage",
      badge: "preview_sync",
      time: "0.3s",
      icon: "🚀",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "700px" }}>
      {toolItems.map((item, idx) => {
        const itemDelay = idx * 18;
        const progress = spring({
          frame: frame - itemDelay,
          fps,
          config: SPRING_SNAPPY,
        });

        const isDone = frame >= itemDelay + 25;
        const opacity = interpolate(progress, [0, 0.5, 1], [0, 0.8, 1]);
        const translateX = interpolate(progress, [0, 1], [-25, 0]);

        return (
          <div
            key={item.title}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              borderRadius: "12px",
              backgroundColor: "rgba(24, 24, 27, 0.7)",
              border: `1px solid ${isDone ? "rgba(99, 102, 241, 0.3)" : CAIDE_THEME.colors.border}`,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              transform: `translateX(${translateX}px)`,
              opacity,
              fontFamily: CAIDE_THEME.typography.fontFamily,
              color: CAIDE_THEME.colors.foreground,
              boxShadow: isDone ? "0 4px 20px rgba(99, 102, 241, 0.15)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                }}
              >
                {item.icon}
              </div>

              <div>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>{item.title}</div>
                <div
                  style={{
                    fontSize: "11px",
                    color: CAIDE_THEME.colors.subtleForeground,
                    fontFamily: CAIDE_THEME.typography.fontMono,
                    marginTop: "2px",
                  }}
                >
                  {item.badge}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "12px",
                  color: CAIDE_THEME.colors.mutedForeground,
                  fontFamily: CAIDE_THEME.typography.fontMono,
                }}
              >
                {item.time}
              </span>
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: isDone ? CAIDE_THEME.colors.emerald : "rgba(99, 102, 241, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                }}
              >
                {isDone ? (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path
                      d="M1.5 4.5L4 7L9.5 1.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      border: "2px solid #6366f1",
                      borderTopColor: "transparent",
                      transform: `rotate(${frame * 15}deg)`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
