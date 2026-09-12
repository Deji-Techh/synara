import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const CaideDevice: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const scale = interpolate(entrance, [0, 1], [0.85, 1]);
  const opacity = interpolate(entrance, [0, 0.4, 1], [0, 0.8, 1]);
  const rotY = interpolate(entrance, [0, 1], [-12, -3]);
  const rotX = interpolate(entrance, [0, 1], [8, 2]);

  // Chart data animated wave
  const chartPoints: Array<[number, number]> = [
    [10, 80],
    [50, 65],
    [90, 75],
    [130, 45],
    [170, 50],
    [210, 30],
    [250, 38],
    [290, 18],
  ];

  const chartPath = chartPoints
    .map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px} ${py + Math.sin((frame + i * 15) * 0.08) * 4}`)
    .join(" ");

  const fillPath = `${chartPath} L 290 120 L 10 120 Z`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        perspective: "1200px",
      }}
    >
      {/* Device Frame */}
      <div
        style={{
          width: "360px",
          height: "720px",
          backgroundColor: "#0d0e12",
          borderRadius: "50px",
          border: "4px solid #27272a",
          boxShadow: `
            0 0 0 2px rgba(255, 255, 255, 0.1),
            0 30px 80px rgba(0, 0, 0, 0.9),
            0 0 50px rgba(99, 102, 241, 0.25)
          `,
          padding: "12px",
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${scale})`,
          opacity,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dynamic Island / Speaker */}
        <div
          style={{
            position: "absolute",
            top: "22px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "110px",
            height: "26px",
            backgroundColor: "#000000",
            borderRadius: "20px",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: "10px",
          }}
        >
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#1c1917" }} />
        </div>

        {/* Screen Bezel Container */}
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#09090b",
            borderRadius: "40px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            fontFamily: CAIDE_THEME.typography.fontFamily,
          }}
        >
          {/* Status Bar */}
          <div
            style={{
              height: "44px",
              padding: "0 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              fontWeight: 600,
              color: "#ffffff",
              paddingTop: "6px",
            }}
          >
            <span>9:41</span>
            <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
              <span>5G</span>
              <div style={{ width: "20px", height: "10px", borderRadius: "3px", border: "1px solid white", padding: "1px" }}>
                <div style={{ width: "80%", height: "100%", backgroundColor: "white", borderRadius: "1px" }} />
              </div>
            </div>
          </div>

          {/* App Header */}
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "11px", color: CAIDE_THEME.colors.mutedForeground, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Live Portfolio
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em" }}>
                $48,290.45
              </div>
            </div>

            <div
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: CAIDE_THEME.colors.emerald,
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              +14.8%
            </div>
          </div>

          {/* Chart Area */}
          <div style={{ padding: "10px 20px", height: "150px" }}>
            <svg width="100%" height="130" viewBox="0 0 300 120" style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={fillPath} fill="url(#chartGlow)" />
              <path d={chartPath} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Pulsing Live Node */}
              <circle cx="290" cy={18 + Math.sin((frame + 105) * 0.08) * 4} r="5" fill="#ffffff" />
              <circle cx="290" cy={18 + Math.sin((frame + 105) * 0.08) * 4} r="10" fill="#6366f1" opacity="0.4" />
            </svg>
          </div>

          {/* Asset Rows */}
          <div style={{ flex: 1, padding: "10px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { name: "Bitcoin", symbol: "BTC", price: "$96,420.00", change: "+4.2%", color: "#f59e0b" },
              { name: "Ethereum", symbol: "ETH", price: "$3,480.12", change: "+6.8%", color: "#6366f1" },
              { name: "Solana", symbol: "SOL", price: "$210.80", change: "+18.4%", color: "#10b981" },
            ].map((coin) => (
              <div
                key={coin.symbol}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: coin.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "11px",
                      color: "#000000",
                    }}
                  >
                    {coin.symbol[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>{coin.name}</div>
                    <div style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>{coin.symbol}</div>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>{coin.price}</div>
                  <div style={{ fontSize: "11px", color: CAIDE_THEME.colors.emerald, fontWeight: 600 }}>{coin.change}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Nav Bar */}
          <div
            style={{
              height: "60px",
              borderTop: `1px solid ${CAIDE_THEME.colors.border}`,
              backgroundColor: "rgba(18, 18, 22, 0.9)",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              paddingBottom: "10px",
            }}
          >
            <span style={{ fontSize: "18px", color: "#6366f1" }}>✦</span>
            <span style={{ fontSize: "18px", color: CAIDE_THEME.colors.subtleForeground }}>⚡</span>
            <span style={{ fontSize: "18px", color: CAIDE_THEME.colors.subtleForeground }}>⚙</span>
          </div>
        </div>
      </div>

      {/* Preview Stage Control Rail */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "10px 8px",
          backgroundColor: "rgba(24, 24, 27, 0.8)",
          borderRadius: "16px",
          border: `1px solid ${CAIDE_THEME.colors.border}`,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
        }}
      >
        {[
          { label: "Reload", icon: "↺" },
          { label: "Rotate", icon: "⟲" },
          { label: "Mobile QR", icon: "📱" },
          { label: "Terminal", icon: "⌨" },
        ].map((ctrl) => (
          <div
            key={ctrl.label}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CAIDE_THEME.colors.foreground,
              fontSize: "15px",
            }}
          >
            {ctrl.icon}
          </div>
        ))}
      </div>
    </div>
  );
};
