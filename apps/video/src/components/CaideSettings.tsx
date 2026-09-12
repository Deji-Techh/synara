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

  const scale = interpolate(entrance, [0, 1], [0.94, 1]);
  const opacity = interpolate(entrance, [0, 0.6, 1], [0, 0.85, 1]);
  const rotX = interpolate(entrance, [0, 1], [6, 0]);

  return (
    <div
      style={{
        width: "980px",
        height: "600px",
        backgroundColor: "rgba(18, 18, 21, 0.9)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: "20px",
        border: `1px solid ${CAIDE_THEME.colors.border}`,
        boxShadow: "0 30px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)",
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
          width: "240px",
          borderRight: `1px solid ${CAIDE_THEME.colors.border}`,
          backgroundColor: "rgba(14, 14, 17, 0.7)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div style={{ padding: "0 10px 14px 10px", fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Settings
        </div>

        {[
          { label: "AI Providers & Models", active: true, badge: "Zen/Claude" },
          { label: "Databases (Neon & Supabase)", active: false, badge: "Connected" },
          { label: "MCP Tool Servers", active: false, badge: "12 active" },
          { label: "Theme & Customization", active: false },
          { label: "Keyboard Shortcuts", active: false },
        ].map((item, i) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: item.active ? "rgba(99, 102, 241, 0.15)" : "transparent",
              color: item.active ? "#ffffff" : CAIDE_THEME.colors.mutedForeground,
              fontWeight: item.active ? 600 : 400,
              fontSize: "13px",
              border: item.active ? `1px solid rgba(99, 102, 241, 0.3)` : "1px solid transparent",
            }}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 6px",
                  borderRadius: "6px",
                  backgroundColor: item.active ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.05)",
                  color: item.active ? "#c7d2fe" : CAIDE_THEME.colors.subtleForeground,
                }}
              >
                {item.badge}
              </span>
            )}
          </div>
        ))}

        <div style={{ marginTop: "auto", padding: "10px 12px", fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>
          Caide Core Engine v0.9.0
        </div>
      </div>

      {/* Main Settings Content Area */}
      <div style={{ flex: 1, padding: "30px", overflowY: "hidden", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Section Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0, marginBottom: "4px" }}>
              Providers & Model Routing
            </h3>
            <p style={{ fontSize: "13px", color: CAIDE_THEME.colors.mutedForeground, margin: 0 }}>
              Direct streaming with local fallback, OpenCode Zen/Go gateway, and multi-provider keys.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontSize: "12px",
              fontWeight: 600,
              color: CAIDE_THEME.colors.emerald,
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: CAIDE_THEME.colors.emerald,
                boxShadow: "0 0 8px #10b981",
              }}
            />
            All Endpoints Healthy
          </div>
        </div>

        {/* Provider Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {PROVIDERS_DATA.map((prov, i) => {
            const cardEntrance = spring({
              frame: frame - (15 + i * 5),
              fps,
              config: SPRING_SNAPPY,
            });

            return (
              <div
                key={prov.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(24, 24, 27, 0.6)",
                  border: `1px solid ${CAIDE_THEME.colors.border}`,
                  transform: `translateX(${interpolate(cardEntrance, [0, 1], [30, 0])}px)`,
                  opacity: interpolate(cardEntrance, [0, 1], [0, 1]),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: prov.accent,
                      fontWeight: 700,
                      fontSize: "16px",
                      border: `1px solid ${CAIDE_THEME.colors.border}`,
                    }}
                  >
                    ✦
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600 }}>{prov.name}</span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(255, 255, 255, 0.08)",
                          color: prov.accent,
                        }}
                      >
                        {prov.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: CAIDE_THEME.colors.mutedForeground, marginTop: "2px", fontFamily: CAIDE_THEME.typography.fontMono }}>
                      {prov.models}
                    </div>
                  </div>
                </div>

                {/* Status toggle */}
                <div
                  style={{
                    width: "42px",
                    height: "24px",
                    borderRadius: "12px",
                    backgroundColor: CAIDE_THEME.colors.primary,
                    padding: "2px",
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Database Quick Integrations */}
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            backgroundColor: "rgba(24, 24, 27, 0.4)",
            border: `1px solid ${CAIDE_THEME.colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: CAIDE_THEME.colors.emerald,
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>Neon & Supabase PostgreSQL</div>
              <div style={{ fontSize: "12px", color: CAIDE_THEME.colors.mutedForeground }}>
                Instant schema migrations & local database branching on every prompt.
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(16, 185, 129, 0.2)",
              color: CAIDE_THEME.colors.emerald,
            }}
          >
            AUTO-SYNC ON
          </div>
        </div>
      </div>
    </div>
  );
};
