import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { CAIDE_THEME } from "../constants/theme";
import { SPRING_SNAPPY } from "../constants/timings";

interface KineticTextProps {
  text: string;
  delay?: number;
  stagger?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  gradient?: boolean;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: string;
}

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  delay = 0,
  stagger = 3,
  fontSize = 56,
  fontWeight = 700,
  color = CAIDE_THEME.colors.foreground,
  gradient = false,
  align = "center",
  lineHeight = 1.15,
  letterSpacing = "-0.03em",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(" ");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        gap: "0.28em",
        fontFamily: CAIDE_THEME.typography.fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight,
        lineHeight,
        letterSpacing,
        textAlign: align,
      }}
    >
      {words.map((word, index) => {
        const wordDelay = delay + index * stagger;
        const progress = spring({
          frame: frame - wordDelay,
          fps,
          config: SPRING_SNAPPY,
        });

        const opacity = interpolate(progress, [0, 0.4, 1], [0, 0.8, 1]);
        const translateY = interpolate(progress, [0, 1], [30, 0]);
        const scale = interpolate(progress, [0, 1], [0.94, 1]);
        const blur = interpolate(progress, [0, 1], [8, 0]);

        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${translateY}px) scale(${scale})`,
              filter: blur > 0.5 ? `blur(${blur}px)` : "none",
              color: gradient ? "transparent" : color,
              backgroundImage: gradient
                ? "linear-gradient(135deg, #ffffff 30%, #a5b4fc 70%, #6366f1 100%)"
                : undefined,
              WebkitBackgroundClip: gradient ? "text" : undefined,
              backgroundClip: gradient ? "text" : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
