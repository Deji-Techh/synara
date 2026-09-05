import type { CSSProperties } from "react";
import type {
  ChatFontWeight,
  ChatHighlightColor,
  ChatLetterSpacing,
  ChatLineHeight,
  ChatWordSpacing,
} from "../appSettings";

export interface ChatTypographySettings {
  chatLineHeight?: ChatLineHeight;
  chatWordSpacing?: ChatWordSpacing;
  chatLetterSpacing?: ChatLetterSpacing;
  chatFontWeight?: ChatFontWeight;
  chatHighlightColor?: ChatHighlightColor;
}

export const CHAT_LINE_HEIGHT_OPTIONS: readonly {
  value: ChatLineHeight;
  label: string;
  cssValue: string;
}[] = [
  { value: "compact", label: "Compact", cssValue: "1.45" },
  { value: "normal", label: "Normal", cssValue: "1.6" },
  { value: "relaxed", label: "Relaxed", cssValue: "1.75" },
  { value: "loose", label: "Loose", cssValue: "1.95" },
];

export const CHAT_WORD_SPACING_OPTIONS: readonly {
  value: ChatWordSpacing;
  label: string;
  cssValue: string;
}[] = [
  { value: "tight", label: "Tight", cssValue: "-0.03em" },
  { value: "normal", label: "Normal", cssValue: "normal" },
  { value: "wide", label: "Wide", cssValue: "0.08em" },
];

export const CHAT_LETTER_SPACING_OPTIONS: readonly {
  value: ChatLetterSpacing;
  label: string;
  cssValue: string;
}[] = [
  { value: "tight", label: "Tight", cssValue: "-0.02em" },
  { value: "normal", label: "Normal", cssValue: "normal" },
  { value: "wide", label: "Wide", cssValue: "0.035em" },
];

export const CHAT_FONT_WEIGHT_OPTIONS: readonly {
  value: ChatFontWeight;
  label: string;
  description: string;
  baseWeight: string;
  boldWeight: string;
  headingWeight: string;
}[] = [
  {
    value: "normal",
    label: "Normal",
    description: "Standard body (400) and bold (600)",
    baseWeight: "400",
    boldWeight: "600",
    headingWeight: "650",
  },
  {
    value: "medium",
    label: "Medium Bold",
    description: "Crisper, weighted body (450) and rich bold (700)",
    baseWeight: "450",
    boldWeight: "700",
    headingWeight: "720",
  },
  {
    value: "bolder",
    label: "Extra Bold",
    description: "High-contrast, bold body (500) and punchy bold (800)",
    baseWeight: "500",
    boldWeight: "800",
    headingWeight: "800",
  },
];

export const CHAT_HIGHLIGHT_COLOR_OPTIONS: readonly {
  value: ChatHighlightColor;
  label: string;
  swatchClass: string;
  light: { bg: string; text: string; border: string };
  dark: { bg: string; text: string; border: string };
}[] = [
  {
    value: "amber",
    label: "Amber",
    swatchClass: "bg-amber-400 border-amber-500",
    light: { bg: "#fef3c7", text: "#78350f", border: "#fde68a" },
    dark: { bg: "rgba(245, 158, 11, 0.25)", text: "#fde68a", border: "rgba(245, 158, 11, 0.45)" },
  },
  {
    value: "emerald",
    label: "Emerald",
    swatchClass: "bg-emerald-400 border-emerald-500",
    light: { bg: "#d1fae5", text: "#064e3b", border: "#a7f3d0" },
    dark: { bg: "rgba(16, 185, 129, 0.25)", text: "#a7f3d0", border: "rgba(16, 185, 129, 0.45)" },
  },
  {
    value: "sky",
    label: "Sky",
    swatchClass: "bg-sky-400 border-sky-500",
    light: { bg: "#e0f2fe", text: "#0c4a6e", border: "#bae6fd" },
    dark: { bg: "rgba(14, 165, 233, 0.25)", text: "#bae6fd", border: "rgba(14, 165, 233, 0.45)" },
  },
  {
    value: "violet",
    label: "Violet",
    swatchClass: "bg-violet-400 border-violet-500",
    light: { bg: "#ede9fe", text: "#4c1d95", border: "#ddd6fe" },
    dark: { bg: "rgba(139, 92, 246, 0.25)", text: "#ddd6fe", border: "rgba(139, 92, 246, 0.45)" },
  },
  {
    value: "rose",
    label: "Rose",
    swatchClass: "bg-rose-400 border-rose-500",
    light: { bg: "#ffe4e6", text: "#881337", border: "#fecdd3" },
    dark: { bg: "rgba(244, 63, 94, 0.25)", text: "#fecdd3", border: "rgba(244, 63, 94, 0.45)" },
  },
];

export function resolveChatTypographyCssProperties(
  settings: ChatTypographySettings,
  isDark = true,
): CSSProperties {
  const lineHeightOpt =
    CHAT_LINE_HEIGHT_OPTIONS.find((o) => o.value === settings.chatLineHeight) ??
    CHAT_LINE_HEIGHT_OPTIONS[2]; // relaxed default
  const wordSpacingOpt =
    CHAT_WORD_SPACING_OPTIONS.find((o) => o.value === settings.chatWordSpacing) ??
    CHAT_WORD_SPACING_OPTIONS[1];
  const letterSpacingOpt =
    CHAT_LETTER_SPACING_OPTIONS.find((o) => o.value === settings.chatLetterSpacing) ??
    CHAT_LETTER_SPACING_OPTIONS[1];
  const fontWeightOpt =
    CHAT_FONT_WEIGHT_OPTIONS.find((o) => o.value === settings.chatFontWeight) ??
    CHAT_FONT_WEIGHT_OPTIONS[1]; // medium default
  const highlightOpt =
    CHAT_HIGHLIGHT_COLOR_OPTIONS.find((o) => o.value === settings.chatHighlightColor) ??
    CHAT_HIGHLIGHT_COLOR_OPTIONS[0];

  const highlightTheme = isDark ? highlightOpt.dark : highlightOpt.light;

  return {
    "--chat-line-height": lineHeightOpt.cssValue,
    "--chat-word-spacing": wordSpacingOpt.cssValue,
    "--chat-letter-spacing": letterSpacingOpt.cssValue,
    "--chat-font-weight": fontWeightOpt.baseWeight,
    "--chat-bold-weight": fontWeightOpt.boldWeight,
    "--chat-heading-weight": fontWeightOpt.headingWeight,
    "--chat-highlight-bg": highlightTheme.bg,
    "--chat-highlight-text": highlightTheme.text,
    "--chat-highlight-border": highlightTheme.border,
    lineHeight: lineHeightOpt.cssValue,
    wordSpacing: wordSpacingOpt.cssValue,
    letterSpacing: letterSpacingOpt.cssValue,
    fontWeight: fontWeightOpt.baseWeight,
  } as CSSProperties;
}
