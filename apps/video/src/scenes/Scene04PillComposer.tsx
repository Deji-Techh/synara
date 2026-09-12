import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideComposer } from "../components/CaideComposer";
import { ToolExecution } from "../components/ToolExecution";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

export const Scene04PillComposer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isExecuting = frame >= 130;
  const toolListSpring = spring({
    frame: frame - 130,
    fps,
    config: SPRING_SNAPPY,
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.3} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "28px",
        }}
      >
        {/* Active Stage Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 16px",
            borderRadius: "100px",
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            color: "#c7d2fe",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: CAIDE_THEME.typography.fontFamily,
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isExecuting ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.emerald,
              boxShadow: `0 0 10px ${isExecuting ? CAIDE_THEME.colors.primary : CAIDE_THEME.colors.emerald}`,
            }}
          />
          <span>{isExecuting ? "Autonomous Agent Tool Execution" : "Pill Composer Architecture"}</span>
        </div>

        {/* Staggered Tool Execution List (Appears when Prompt is Sent) */}
        {isExecuting && (
          <div
            style={{
              transform: `translateY(${interpolate(toolListSpring, [0, 1], [30, 0])}px)`,
              opacity: interpolate(toolListSpring, [0, 1], [0, 1]),
            }}
          >
            <ToolExecution />
          </div>
        )}

        {/* Authentic Caide Floating Pill Composer */}
        <CaideComposer typingStartFrame={15} sendTriggerFrame={125} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
