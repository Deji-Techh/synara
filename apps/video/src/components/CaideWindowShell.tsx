// FILE: CaideWindowShell.tsx
// Purpose: 100% exact carbon copy of Caide desktop window from user's actual app
// Layer: Video core UI shell

import React from "react";
import { useCurrentFrame, interpolate, staticFile, Img } from "remotion";
import { CAIDE_THEME } from "../constants/theme";

interface CaideWindowShellProps {
  showCreateAppModal?: boolean;
  showSettingsModal?: boolean;
  showPreviewStage?: boolean;
  previewStageProgress?: number; // 0 to 1
  composerTypedProgress?: number; // 0 to 1
  isAgentRunning?: boolean;
  completedToolsCount?: number; // 0 to 4
  interactiveDeviceTimeframe?: "1D" | "1W";
  promptOverride?: string;
  showThirdUserMessage?: boolean;
}

export const CaideWindowShell: React.FC<CaideWindowShellProps> = ({
  showCreateAppModal = false,
  showSettingsModal = false,
  showPreviewStage = false,
  previewStageProgress = 0,
  composerTypedProgress = 0,
  isAgentRunning = false,
  completedToolsCount = 0,
  interactiveDeviceTimeframe = "1D",
  promptOverride,
  showThirdUserMessage = false,
}) => {
  const frame = useCurrentFrame();

  const fullPrompt =
    promptOverride ??
    "Build a real-time crypto tracker with candlestick charts, Neon Postgres, and push alerts";
  const displayedChars = Math.floor(fullPrompt.length * composerTypedProgress);
  const displayedPrompt = fullPrompt.slice(0, displayedChars);

  // Dynamic preview width: 0 -> 560px
  const previewWidth = interpolate(previewStageProgress, [0, 1], [0, 560]);

  // Phone chart points based on timeframe
  const is1W = interactiveDeviceTimeframe === "1W";
  const morph = is1W ? 1 : 0;
  const chartPoints1D = [
    [10, 80],
    [45, 65],
    [80, 75],
    [115, 45],
    [150, 50],
    [185, 30],
    [220, 38],
    [260, 18],
  ];
  const chartPoints1W = [
    [10, 95],
    [45, 85],
    [80, 60],
    [115, 68],
    [150, 40],
    [185, 25],
    [220, 16],
    [260, 8],
  ];
  const chartPath = chartPoints1D
    .map(([x, y1], i) => {
      const y2 = chartPoints1W[i]?.[1] ?? y1;
      const curY =
        (y1 ?? 0) + ((y2 ?? 0) - (y1 ?? 0)) * morph + Math.sin((frame + i * 15) * 0.08) * 1.5;
      return `${i === 0 ? "M" : "L"} ${x} ${curY}`;
    })
    .join(" ");

  // Fill gradient path under chart
  const areaPath = `${chartPath} L 260 120 L 10 120 Z`;

  // Auto-scroll transcript up when agent runs and tools execute
  const transcriptScrollY = isAgentRunning
    ? interpolate(completedToolsCount, [0, 1, 2, 3, 4], [25, 75, 125, 185, 250], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : showThirdUserMessage
      ? 25
      : 0;

  return (
    <div
      style={{
        width: "1680px",
        height: "960px",
        backgroundColor: "#0e0e0e",
        borderRadius: "14px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: CAIDE_THEME.shadows.window,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        fontFamily: CAIDE_THEME.typography.fontFamily,
        color: "#f5f5f5",
      }}
    >
      {/* ─── 1. Window Header / Breadcrumb Bar ─── */}
      <div
        style={{
          height: "36px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          backgroundColor: "#0b0b0b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          userSelect: "none",
          zIndex: 10,
        }}
      >
        {/* macOS Traffic Lights */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px", width: "160px" }}>
          <div
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "50%",
              backgroundColor: "#ff5f56",
            }}
          />
          <div
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "50%",
              backgroundColor: "#ffbd2e",
            }}
          />
          <div
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "50%",
              backgroundColor: "#27c93f",
            }}
          />
        </div>

        {/* Center Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11.5px",
            color: "#888888",
          }}
        >
          <span style={{ color: "#ffffff", fontWeight: 600 }}>Caide</span>
          <span>/</span>
          <span style={{ color: "#dddddd" }}>wandering-otter</span>
          <span
            style={{
              padding: "1px 5px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              fontSize: "10.5px",
              fontFamily: CAIDE_THEME.typography.fontMono,
              color: "#aaaaaa",
            }}
          >
            main
          </span>
        </div>

        {/* Right Window Status Icons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "160px",
            justifyContent: "flex-end",
          }}
        >
          {/* Git Branch */}
          <div
            style={{
              color: "#777777",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontFamily: CAIDE_THEME.typography.fontMono,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span>main</span>
          </div>
          {/* Settings Icon */}
          <div style={{ color: showSettingsModal ? "#ffffff" : "#777777", cursor: "pointer" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 2. Main Body: Left Sidebar + Center Workspace + Right Preview Stage ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── LEFT SIDEBAR (Exact Carbon Copy of User Screenshot) ── */}
        <div
          style={{
            width: "220px",
            borderRight: "1px solid rgba(255, 255, 255, 0.06)",
            backgroundColor: "#111111",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {/* Sidebar Top Header Row: Caide + Nav Controls + Avatar Artwork */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 10px 6px 12px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: "-0.01em",
                }}
              >
                Caide
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: "rgba(255, 255, 255, 0.6)",
                }}
              >
                {/* Sidebar toggle */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                {/* Nav arrows */}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>

            {/* Profile Avatar Artwork from User Screenshot */}
            <div
              style={{
                width: "68px",
                height: "28px",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.5)",
              }}
            >
              <Img
                src={staticFile("sidebar-avatar.png")}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
          </div>

          {/* Search Row + Gamepad launcher icon */}
          <div style={{ position: "relative", zIndex: 1, padding: "4px 10px 8px 10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 8px",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                fontSize: "11.5px",
                color: "#777777",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span style={{ flex: 1 }}>Search</span>
              {/* Gamepad icon */}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "#555555" }}
              >
                <line x1="6" y1="12" x2="10" y2="12" />
                <line x1="8" y1="10" x2="8" y2="14" />
                <line x1="15" y1="13" x2="15.01" y2="13" />
                <line x1="18" y1="11" x2="18.01" y2="11" />
                <rect x="2" y="6" width="20" height="12" rx="6" />
              </svg>
            </div>
          </div>

          {/* Projects Section Header */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px 2px 12px",
              fontSize: "10.5px",
              fontWeight: 600,
              color: "#666666",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span>Projects</span>
            {/* Folder icon */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>

          {/* Scrollable Projects Tree */}
          <div
            style={{
              flex: 1,
              overflowY: "hidden",
              padding: "4px 6px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              fontSize: "11.5px",
            }}
          >
            {/* Active Project: wandering-otter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 6px",
                borderRadius: "5px",
                color: "#f5f5f5",
                fontWeight: 500,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "#aaaaaa" }}
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: "11px",
                }}
              >
                wandering-otter
              </span>
            </div>

            {/* Indented Active Thread: Chat 1 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px 4px 22px",
                borderRadius: "5px",
                backgroundColor: "#222222",
                color: "#ffffff",
                fontWeight: 500,
                fontSize: "11px",
              }}
            >
              <span>Chat 1</span>
              <span style={{ fontSize: "9.5px", color: "#666666" }}>1h</span>
            </div>

            {/* Other Projects matching screenshot */}
            {[
              "mushy-gods",
              "nappy-otter",
              "wandering-vulcan",
              "flawless-vulcan",
              "previous-jigsaw",
              "medical-koala",
              "luo-mp-test-2",
              "luo mp test 2",
              "vento",
              "vento-kouy",
              "luo marketplace",
              "Calculator",
              "analyse-this-project-suggest",
              "test react native 2",
            ].map((pName) => (
              <div
                key={pName}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3.5px 6px",
                  borderRadius: "5px",
                  color: "#777777",
                  fontSize: "11px",
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ color: "#555555" }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: "#555555" }}
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {pName}
                </span>
              </div>
            ))}
          </div>

          {/* Sidebar Footer: Settings & + Add Button */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "#777777",
            }}
          >
            {/* Spiral / Settings icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ cursor: "pointer" }}
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {/* Plus add button */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ cursor: "pointer" }}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>

        {/* Vertical Drag Handle Divider with 3 Dots */}
        <div
          style={{
            width: "5px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            cursor: "col-resize",
            userSelect: "none",
            gap: "3px",
          }}
        >
          <div
            style={{
              width: "2px",
              height: "2px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
            }}
          />
          <div
            style={{
              width: "2px",
              height: "2px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
            }}
          />
          <div
            style={{
              width: "2px",
              height: "2px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
            }}
          />
        </div>

        {/* ── CENTER CHAT WORKSPACE (1:1 from User Screenshot) ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0e0e0e",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top Header of Chat Surface */}
          <div
            style={{
              height: "40px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              backgroundColor: "#0e0e0e",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              userSelect: "none",
            }}
          >
            {/* Left: Chat Title */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12.5px",
                fontWeight: 500,
                color: "#ffffff",
              }}
            >
              <span style={{ color: "#666666" }}>#</span>
              <span>Chat 1</span>
            </div>

            {/* Right: Hand off + Add action + Panel Toggles */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Hand off button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  fontSize: "11px",
                  color: "#dddddd",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                <span>Hand off</span>
              </div>

              {/* Add action button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  fontSize: "11px",
                  color: "#dddddd",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add action</span>
              </div>

              {/* Dock right panel icons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#777777",
                  marginLeft: "4px",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
              </div>
            </div>
          </div>

          {/* ── Chat Transcript Area (Direct Carbon Copy of User Screenshot) ── */}
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                padding: "16px 44px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                fontSize: "13px",
                lineHeight: 1.5,
                transform: `translateY(-${transcriptScrollY}px)`,
                transition: "transform 0.2s ease-out",
              }}
            >
              {/* User message 1: "hey" */}
              <div style={{ alignSelf: "flex-end" }}>
                <div
                  style={{
                    backgroundColor: "#202020",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "14px",
                    padding: "5px 14px",
                    fontSize: "12.5px",
                    color: "#ffffff",
                  }}
                >
                  hey
                </div>
              </div>

              {/* Assistant message 1: "Hey! How can I help with the app today?" */}
              <div style={{ alignSelf: "flex-start", color: "#e0e0e0", fontSize: "13px" }}>
                Hey! How can I help with the app today?
              </div>

              {/* User message 2: "what kind of apps on what framework can you build" */}
              <div style={{ alignSelf: "flex-end" }}>
                <div
                  style={{
                    backgroundColor: "#202020",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "14px",
                    padding: "7px 16px",
                    fontSize: "12.5px",
                    color: "#ffffff",
                  }}
                >
                  what kind of apps on what framework can you build
                </div>
              </div>

              {/* Assistant message 2: Markdown framework table & bullet points */}
              <div
                style={{
                  alignSelf: "flex-start",
                  color: "#e2e2e2",
                  maxWidth: "680px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "12.5px",
                }}
              >
                <div>
                  I build production mobile apps and web apps across several frameworks. Here&apos;s
                  the breakdown:
                </div>

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "13.5px",
                    color: "#ffffff",
                    marginTop: "2px",
                  }}
                >
                  Frameworks I work in
                </div>

                {/* Frameworks Table */}
                <div
                  style={{
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    overflow: "hidden",
                    fontSize: "11.5px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "130px 1fr",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "6px 12px",
                      fontWeight: 600,
                      color: "#aaaaaa",
                    }}
                  >
                    <span>Platform</span>
                    <span>Primary Stack</span>
                  </div>
                  {[
                    [
                      "React Native",
                      "Expo SDK 52 + Expo Router + React 19 + Zustand + React Query + TypeScript",
                    ],
                    ["Flutter", "Dart + Flutter SDK"],
                    ["Website (React)", "React 19 + Vite + Tailwind CSS"],
                    ["Blank", "Custom / unopinionated scaffold"],
                  ].map(([plat, stack], idx) => (
                    <div
                      key={plat}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "130px 1fr",
                        padding: "6px 12px",
                        borderBottom: idx < 3 ? "1px solid rgba(255, 255, 255, 0.04)" : "none",
                        backgroundColor:
                          idx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.015)",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>{plat}</span>
                      <span style={{ color: "#b0b0b0" }}>{stack}</span>
                    </div>
                  ))}
                </div>

                <div style={{ color: "#aaaaaa", fontSize: "11.5px", marginTop: "2px" }}>
                  The project you&apos;re working in right now is{" "}
                  <strong style={{ color: "#ffffff" }}>React Native (Expo)</strong> — that&apos;s
                  the active stack I&apos;ll use to implement anything you request here.
                </div>

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "13.5px",
                    color: "#ffffff",
                    marginTop: "2px",
                  }}
                >
                  Kinds of apps I can build
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                    fontSize: "11.5px",
                    color: "#cccccc",
                  }}
                >
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Social/community</strong> — feeds,
                    conversations, moderation, real-time presence
                  </div>
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Finance</strong> — budgeting, transfers,
                    transaction lists, investment tracking
                  </div>
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Travel/discovery</strong> — maps + list
                    coordination, search, itineraries, live status
                  </div>
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Productivity</strong> — task lists,
                    calendars, nested detail views, keyboard/touch parity
                  </div>
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Learning</strong> — lesson pacing,
                    quizzes, progress feedback
                  </div>
                  <div>
                    • <strong style={{ color: "#ffffff" }}>Health/fitness</strong> — status
                    communication, trends, one-handed logging
                  </div>
                </div>
              </div>

              {/* User message 3: Live Typed Request (Shown when prompted) */}
              {showThirdUserMessage && (
                <div style={{ alignSelf: "flex-end", marginTop: "4px" }}>
                  <div
                    style={{
                      backgroundColor: "#202020",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "14px",
                      padding: "8px 18px",
                      fontSize: "12.5px",
                      color: "#ffffff",
                      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
                    }}
                  >
                    {fullPrompt}
                  </div>
                </div>
              )}

              {/* ── Antigravity Tool Execution Group (1:1 from AntigravityToolGroup.tsx) ── */}
              {isAgentRunning && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    width: "100%",
                    maxWidth: "680px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    marginTop: "6px",
                    fontSize: "12px",
                  }}
                >
                  {/* Collapsible Tool Group Header Button */}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      width: "fit-content",
                      cursor: "pointer",
                      color: "#ffffff",
                      fontWeight: 500,
                    }}
                  >
                    <span>Explored 4 files, ran 2 commands</span>
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ color: "#888888" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Expanded Tool Rows with Left Vertical Line */}
                  <div
                    style={{
                      borderLeft: "2px solid rgba(255, 255, 255, 0.12)",
                      paddingLeft: "12px",
                      marginLeft: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "5px",
                      paddingTop: "2px",
                    }}
                  >
                    {/* Thought Row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        color: "#888888",
                        fontSize: "11.5px",
                      }}
                    >
                      <span style={{ color: "#aaaaaa", fontWeight: 500 }}>Thought for 2s</span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                    {/* Read cryptoService.ts */}
                    {completedToolsCount >= 1 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11.5px",
                        }}
                      >
                        <span style={{ color: "#888888" }}>Read</span>
                        <div
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "#3b82f6",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: CAIDE_THEME.typography.fontMono,
                            color: "#ffffff",
                            fontWeight: 500,
                          }}
                        >
                          cryptoService.ts
                        </span>
                        <span
                          style={{
                            padding: "1px 5px",
                            borderRadius: "3px",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            fontSize: "10px",
                            color: "#888888",
                            fontFamily: CAIDE_THEME.typography.fontMono,
                          }}
                        >
                          L1-L45
                        </span>
                      </div>
                    )}

                    {/* Read index.tsx */}
                    {completedToolsCount >= 2 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11.5px",
                        }}
                      >
                        <span style={{ color: "#888888" }}>Read</span>
                        <div
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "#3b82f6",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: CAIDE_THEME.typography.fontMono,
                            color: "#ffffff",
                            fontWeight: 500,
                          }}
                        >
                          app/(tabs)/index.tsx
                        </span>
                        <span
                          style={{
                            padding: "1px 5px",
                            borderRadius: "3px",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            fontSize: "10px",
                            color: "#888888",
                            fontFamily: CAIDE_THEME.typography.fontMono,
                          }}
                        >
                          L1-L120
                        </span>
                      </div>
                    )}

                    {/* Edited CandlestickChart.tsx */}
                    {completedToolsCount >= 3 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11.5px",
                        }}
                      >
                        <span style={{ color: "#888888" }}>Edited</span>
                        <div
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "#3b82f6",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: CAIDE_THEME.typography.fontMono,
                            color: "#ffffff",
                            fontWeight: 500,
                          }}
                        >
                          components/CandlestickChart.tsx
                        </span>
                        <span
                          style={{
                            padding: "1px 5px",
                            borderRadius: "3px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            fontSize: "10px",
                            color: "#34d399",
                            fontFamily: CAIDE_THEME.typography.fontMono,
                          }}
                        >
                          +84 -12
                        </span>
                      </div>
                    )}

                    {/* Ran bun run test:crypto */}
                    {completedToolsCount >= 4 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11.5px",
                        }}
                      >
                        <span style={{ color: "#888888" }}>Ran</span>
                        <code
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            color: "#ffffff",
                            fontFamily: CAIDE_THEME.typography.fontMono,
                            fontSize: "11px",
                          }}
                        >
                          bun run test:crypto
                        </code>
                        <span style={{ color: "#34d399", fontSize: "11px" }}>✓ 0.4s</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Composer Container (Exact Carbon Copy of User Screenshot) ── */}
          <div
            style={{
              padding: "0 28px 16px 28px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              width: "100%",
              maxWidth: "760px",
              margin: "0 auto",
            }}
          >
            {/* Main Rounded Input Box */}
            <div
              style={{
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "#141414",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
              }}
            >
              {/* Textarea or Placeholder */}
              <div
                style={{
                  minHeight: "28px",
                  fontSize: "12.5px",
                  color: displayedChars > 0 ? "#ffffff" : "#666666",
                  lineHeight: 1.4,
                }}
              >
                {displayedChars > 0 ? (
                  <span>
                    {displayedPrompt}
                    <span
                      style={{
                        display: "inline-block",
                        width: "2px",
                        height: "14px",
                        backgroundColor: "#5b5bd6",
                        marginLeft: "2px",
                        verticalAlign: "middle",
                      }}
                    />
                  </span>
                ) : (
                  "Ask for changes, send follow-ups, or attach images"
                )}
              </div>

              {/* Bottom Row Inside Box: Selectors + Actions */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                {/* Left: Free (OpenRouter) + Agent + Full Access */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}
                >
                  {/* Free (OpenRouter) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "#cccccc",
                      cursor: "pointer",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span>Free (OpenRouter)</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ color: "#777777" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Agent */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "#cccccc",
                      cursor: "pointer",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Agent</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ color: "#777777" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Full access (amber) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                      color: "#f59e0b",
                      cursor: "pointer",
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    <span>Full access</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* Right: Mic + Paperclip + Circular Purple Send Button */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Mic */}
                  <div style={{ color: "#777777", cursor: "pointer", padding: "4px" }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>

                  {/* Paperclip */}
                  <div style={{ color: "#777777", cursor: "pointer", padding: "4px" }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </div>

                  {/* Purple Circle Send Button */}
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "#5b5bd6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(91, 91, 214, 0.4)",
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Attached Sub-strip: Current checkout & main */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 10px",
                fontSize: "11px",
                color: "#777777",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: "#666666" }}
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ color: "#aaaaaa" }}>Current checkout</span>
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  cursor: "pointer",
                  fontFamily: CAIDE_THEME.typography.fontMono,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: "#666666" }}
                >
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span style={{ color: "#aaaaaa" }}>main</span>
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. Fixed 672px Preview Stage (Attached Right Dock from /preview or Ctrl+P) ── */}
        <div
          style={{
            width: `${previewWidth}px`,
            borderLeft: previewWidth > 0 ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
            backgroundColor: "#0d0d0d",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
            transition: "width 0.22s ease-out",
          }}
        >
          {previewWidth > 200 && (
            <div
              style={{ width: "560px", height: "100%", display: "flex", flexDirection: "column" }}
            >
              {/* Preview Stage Header */}
              <div
                style={{
                  height: "38px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                  backgroundColor: "#111111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  userSelect: "none",
                }}
              >
                {/* Left: Preview label + Status Pill */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff" }}>
                    Preview
                  </span>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "2px 7px",
                      borderRadius: "999px",
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      fontSize: "10.5px",
                      fontWeight: 500,
                      color: "#34d399",
                    }}
                  >
                    <div
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981",
                      }}
                    />
                    <span>Running</span>
                  </div>
                </div>

                {/* Right: Controls Cluster */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px", color: "#888888" }}
                >
                  {/* Home */}
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  {/* Rotate */}
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {/* QR Code */}
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  {/* Terminal Console */}
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  {/* Power Shutdown */}
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "#ef4444" }}
                  >
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                </div>
              </div>

              {/* Preview Body with Chassis & Live React Native Crypto App */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px",
                  backgroundColor: "#080808",
                  position: "relative",
                }}
              >
                {/* Authentic SVG Device Bezel Chassis with Hardware Side Nubs */}
                <div
                  style={{
                    width: "290px",
                    height: "590px",
                    borderRadius: "44px",
                    backgroundColor: "#161616",
                    border: "3px solid #333333",
                    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Hardware Nubs (Power & Volume on right) */}
                  <div
                    style={{
                      position: "absolute",
                      right: "-6px",
                      top: "130px",
                      width: "3px",
                      height: "36px",
                      backgroundColor: "#444444",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: "-6px",
                      top: "180px",
                      width: "3px",
                      height: "60px",
                      backgroundColor: "#444444",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />

                  {/* Phone Notch / Dynamic Island */}
                  <div
                    style={{
                      height: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 16px",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#ffffff",
                      zIndex: 10,
                    }}
                  >
                    <span>9:41</span>
                    <div
                      style={{
                        width: "70px",
                        height: "14px",
                        borderRadius: "10px",
                        backgroundColor: "#000000",
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-4.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z" />
                      </svg>
                      <span style={{ fontSize: "9px" }}>5G</span>
                    </div>
                  </div>

                  {/* App Screen Content: Live React Native Crypto Tracker */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: "#0b0b0f",
                      display: "flex",
                      flexDirection: "column",
                      padding: "10px 14px",
                      gap: "10px",
                      fontFamily: CAIDE_THEME.typography.fontFamily,
                      color: "#ffffff",
                    }}
                  >
                    {/* App Header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "5px",
                            backgroundColor: "#5b5bd6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span style={{ fontSize: "11px", fontWeight: 700 }}>₿</span>
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700 }}>CryptoPulse</span>
                      </div>
                      <div
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981",
                        }}
                      />
                    </div>

                    {/* Balance Display */}
                    <div>
                      <div style={{ fontSize: "10px", color: "#888888" }}>Total Portfolio</div>
                      <div
                        style={{
                          fontSize: "22px",
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                          color: "#ffffff",
                        }}
                      >
                        $24,850.40
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#34d399", fontWeight: 600 }}>
                        +$1,420.50 (5.8%) Today
                      </div>
                    </div>

                    {/* Interactive Timeframe Filter Pills */}
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["1D", "1W", "1M", "1Y"] as const).map((tf) => {
                        const active = interactiveDeviceTimeframe === tf;
                        return (
                          <div
                            key={tf}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: active ? "#ffffff" : "rgba(255, 255, 255, 0.06)",
                              color: active ? "#000000" : "#888888",
                              fontSize: "9.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {tf}
                          </div>
                        );
                      })}
                    </div>

                    {/* Live Candlestick / Area Chart */}
                    <div
                      style={{
                        height: "110px",
                        position: "relative",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        overflow: "hidden",
                      }}
                    >
                      <svg width="270" height="110" style={{ position: "absolute", inset: 0 }}>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5b5bd6" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#5b5bd6" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d={areaPath} fill="url(#chartGrad)" />
                        <path
                          d={chartPath}
                          fill="none"
                          stroke="#6868e8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>

                    {/* Live Assets Ticker List */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#666666",
                          textTransform: "uppercase",
                        }}
                      >
                        Watchlist
                      </div>
                      {[
                        {
                          symbol: "BTC",
                          name: "Bitcoin",
                          price: "$96,420.00",
                          change: "+4.2%",
                          color: "#f59e0b",
                        },
                        {
                          symbol: "ETH",
                          name: "Ethereum",
                          price: "$3,480.20",
                          change: "+6.1%",
                          color: "#6366f1",
                        },
                        {
                          symbol: "SOL",
                          name: "Solana",
                          price: "$215.80",
                          change: "+8.4%",
                          color: "#ec4899",
                        },
                      ].map((coin) => (
                        <div
                          key={coin.symbol}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(255, 255, 255, 0.03)",
                            fontSize: "11px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                backgroundColor: coin.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "9px",
                                fontWeight: 700,
                              }}
                            >
                              {coin.symbol[0]}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "10.5px" }}>
                                {coin.symbol}
                              </div>
                              <div style={{ fontSize: "8.5px", color: "#666666" }}>{coin.name}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 600, fontSize: "10.5px" }}>{coin.price}</div>
                            <div style={{ fontSize: "9px", color: "#34d399" }}>{coin.change}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Tab Bar */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-around",
                        paddingTop: "6px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                        fontSize: "9px",
                        color: "#666666",
                      }}
                    >
                      <span style={{ color: "#ffffff", fontWeight: 600 }}>Home</span>
                      <span>Markets</span>
                      <span>Trade</span>
                      <span>Wallet</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
