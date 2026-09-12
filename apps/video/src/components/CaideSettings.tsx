// FILE: CaideSettings.tsx
// Purpose: 100% clean carbon copy of Caide's Settings dialog (apps/web/src/components/settings/)
// Layer: Video authentic component

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { CAIDE_THEME, PROVIDERS_DATA } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const CaideSettings: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const scale = interpolate(entrance, [0, 1], [0.95, 1]);
  const opacity = interpolate(entrance, [0, 0.5, 1], [0, 0.9, 1]);
  const rotX = interpolate(entrance, [0, 1], [3, 0]);

  return (
    <div
      style={{
        width: "880px",
        height: "540px",
        backgroundColor: "#141414",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: CAIDE_THEME.shadows.dialog,
        display: "flex",
        overflow: "hidden",
        fontFamily: CAIDE_THEME.typography.fontFamily,
        color: CAIDE_THEME.colors.foreground,
        transform: `perspective(1000px) rotateX(${rotX}deg) scale(${scale})`,
        opacity,
      }}
    >
      {/* Settings Navigation Sidebar */}
      <div
        style={{
          width: "220px",
          borderRight: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "#111111",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <div style={{ padding: "0 8px 12px 8px", fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>
          Settings
        </div>

        {[
          { label: "AI Providers & Models", active: true },
          { label: "Databases (Neon & Supabase)", active: false },
          { label: "MCP Tool Servers", active: false },
          { label: "Theme & Customization", active: false },
          { label: "Keyboard Shortcuts", active: false },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              backgroundColor: item.active ? "rgba(255, 255, 255, 0.08)" : "transparent",
              color: item.active ? "#ffffff" : CAIDE_THEME.colors.mutedForeground,
              fontWeight: item.active ? 600 : 400,
              fontSize: "12.5px",
            }}
          >
            {item.label}
          </div>
        ))}

        <div style={{ marginTop: "auto", padding: "8px 10px", fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>
          Caide v0.9.0
        </div>
      </div>

      {/* Main Settings Content */}
      <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 4px 0", color: "#ffffff" }}>
            Providers & Model Routing
          </h3>
          <p style={{ fontSize: "12.5px", color: CAIDE_THEME.colors.mutedForeground, margin: 0 }}>
            Configure LLM endpoints, local tool orchestration, and database branching.
          </p>
        </div>

        {/* Stacked Rows Card (SettingsCard replica) */}
        <div
          style={{
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "#161616",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {PROVIDERS_DATA.map((prov, i) => {
            const toggleFrame = frame - (30 + i * 15);
            const isToggled = toggleFrame > 0;

            return (
              <div
                key={prov.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderBottom: i < PROVIDERS_DATA.length - 1 ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>
                      {prov.name}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(255, 255, 255, 0.06)",
                        color: CAIDE_THEME.colors.mutedForeground,
                      }}
                    >
                      {prov.badge}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono, marginTop: "2px" }}>
                    {prov.models}
                  </div>
                </div>

                {/* Switch Toggle */}
                <div
                  style={{
                    width: "36px",
                    height: "20px",
                    borderRadius: "10px",
                    backgroundColor: isToggled ? "#ffffff" : "rgba(255, 255, 255, 0.15)",
                    position: "relative",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      backgroundColor: isToggled ? "#0e0e0e" : "#ffffff",
                      transform: isToggled ? "translateX(16px)" : "translateX(0px)",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
