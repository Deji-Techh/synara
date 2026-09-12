import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

interface CaideComposerProps {
  typingStartFrame?: number;
  sendTriggerFrame?: number;
}

export const CaideComposer: React.FC<CaideComposerProps> = ({
  typingStartFrame = 20,
  sendTriggerFrame = 140,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: SPRING_SNAPPY,
  });

  const scale = interpolate(entrance, [0, 1], [0.92, 1]);
  const opacity = interpolate(entrance, [0, 0.4, 1], [0, 0.8, 1]);
  const translateY = interpolate(entrance, [0, 1], [30, 0]);

  const fullPrompt = "Build a crypto tracker app with live candlestick charts, wallet connect, and real-time push alerts.";
  const typingProgress = Math.max(0, frame - typingStartFrame);
  const charsCount = Math.min(fullPrompt.length, Math.floor(typingProgress * 1.6));
  const currentPrompt = fullPrompt.slice(0, charsCount);

  const isSending = frame >= sendTriggerFrame;
  const sendSpring = spring({
    frame: frame - sendTriggerFrame,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 200 },
  });

  return (
    <div
      style={{
        width: "780px",
        backgroundColor: "rgba(18, 18, 22, 0.85)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        borderRadius: "24px",
        border: `1.5px solid ${isSending ? CAIDE_THEME.colors.primary : "rgba(255, 255, 255, 0.12)"}`,
        boxShadow: isSending
          ? `0 20px 50px rgba(0, 0, 0, 0.6), 0 0 35px ${CAIDE_THEME.colors.primaryGlow}`
          : "0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        padding: "20px 24px",
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity,
        fontFamily: CAIDE_THEME.typography.fontFamily,
        color: CAIDE_THEME.colors.foreground,
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* Top Model Controls Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Model Selector Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "5px 12px",
              borderRadius: "100px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: `1px solid ${CAIDE_THEME.colors.border}`,
              fontSize: "12px",
              fontWeight: 600,
              color: "#e0e7ff",
            }}
          >
            <span style={{ color: "#818cf8", fontSize: "14px" }}>✦</span>
            <span>claude-3-7-sonnet</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Framework Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "100px",
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              fontSize: "11px",
              fontWeight: 600,
              color: "#a5b4fc",
            }}
          >
            <span>📱 React Native (Expo)</span>
          </div>

          {/* Effort Picker */}
          <div
            style={{
              fontSize: "11px",
              color: CAIDE_THEME.colors.mutedForeground,
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            High Thinking
          </div>
        </div>

        {/* Status Dot */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isSending ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.emerald,
              boxShadow: `0 0 10px ${isSending ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.emerald}`,
            }}
          />
          <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.mutedForeground }}>
            {isSending ? "Synthesizing Architecture..." : "Ready"}
          </span>
        </div>
      </div>

      {/* Main Prompt Text Area */}
      <div
        style={{
          minHeight: "56px",
          fontSize: "18px",
          lineHeight: "1.4",
          color: CAIDE_THEME.colors.foreground,
          letterSpacing: "-0.01em",
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        <span>{currentPrompt}</span>
        {frame % 24 < 12 && charsCount < fullPrompt.length && (
          <span
            style={{
              display: "inline-block",
              width: "2.5px",
              height: "22px",
              backgroundColor: CAIDE_THEME.colors.primary,
              marginLeft: "3px",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>

      {/* Bottom Actions Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
        {/* Left tools (attach, voice, directory) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CAIDE_THEME.colors.mutedForeground,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </div>

          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CAIDE_THEME.colors.mutedForeground,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
            </svg>
          </div>

          <span style={{ fontSize: "12px", color: CAIDE_THEME.colors.subtleForeground }}>
            ~/caide-apps/crypto-pulse
          </span>
        </div>

        {/* Right Send Action */}
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            backgroundColor: isSending ? CAIDE_THEME.colors.primary : "rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: isSending ? `0 0 20px ${CAIDE_THEME.colors.primaryGlow}` : "none",
            transform: `scale(${isSending ? interpolate(sendSpring, [0, 1], [1, 1.1]) : 1})`,
          }}
        >
          {isSending ? (
            <div
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "3px",
                backgroundColor: "#ffffff",
              }}
            />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};
