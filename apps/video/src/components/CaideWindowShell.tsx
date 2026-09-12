// FILE: CaideWindowShell.tsx
// Purpose: 100% clean carbon copy of the Caide desktop application window
// Layer: Video core UI shell

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, staticFile, Img } from "remotion";
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
}) => {
  const frame = useCurrentFrame();

  const fullPrompt =
    "Build a crypto tracker app with live candlestick charts, wallet connect, and real-time push alerts.";
  const displayedChars = Math.floor(fullPrompt.length * composerTypedProgress);
  const displayedPrompt = fullPrompt.slice(0, displayedChars);

  // Tools list matching Caide's TimelineWorkEntryRow
  const tools = [
    {
      title: "Scaffold React Native (Expo) Architecture",
      tool: "create_workspace",
      duration: "0.4s",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      title: "Generate Neon PostgreSQL Database Tables",
      tool: "execute_sql",
      duration: "0.6s",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      ),
    },
    {
      title: "Render Candlestick & Live Price Chart",
      tool: "write_file",
      duration: "0.9s",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      title: "Compile HMR Bundle to Preview Stage",
      tool: "preview_sync",
      duration: "0.3s",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </svg>
      ),
    },
  ];

  // Device chart points morphing based on timeframe
  const is1W = interactiveDeviceTimeframe === "1W";
  const morph = is1W ? 1 : 0;
  const chartPoints1D = [
    [10, 80],
    [50, 65],
    [90, 75],
    [130, 45],
    [170, 50],
    [210, 30],
    [250, 38],
    [290, 18],
  ];
  const chartPoints1W = [
    [10, 95],
    [50, 85],
    [90, 60],
    [130, 68],
    [170, 40],
    [210, 25],
    [250, 16],
    [290, 8],
  ];
  const chartPath = chartPoints1D
    .map(([x, y1], i) => {
      const y2 = chartPoints1W[i]?.[1] ?? y1;
      const curY = y1 + (y2 - y1) * morph + Math.sin((frame + i * 15) * 0.08) * 2;
      return `${i === 0 ? "M" : "L"} ${x} ${curY}`;
    })
    .join(" ");

  const previewWidth = interpolate(previewStageProgress, [0, 1], [0, 540]);

  return (
    <div
      style={{
        width: "1680px",
        height: "960px",
        backgroundColor: CAIDE_THEME.colors.bg,
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: CAIDE_THEME.shadows.window,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        fontFamily: CAIDE_THEME.typography.fontFamily,
        color: CAIDE_THEME.colors.foreground,
      }}
    >
      {/* ─── 1. macOS Titlebar / Header ─── */}
      <div
        style={{
          height: "40px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          backgroundColor: "#0d0d0d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          userSelect: "none",
        }}
      >
        {/* macOS Traffic Lights */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "180px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#ff5f56" }} />
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#27c93f" }} />
        </div>

        {/* Window Title / Project Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: CAIDE_THEME.colors.mutedForeground }}>
          <span style={{ color: "#ffffff", fontWeight: 600 }}>Caide</span>
          <span>/</span>
          <span style={{ color: CAIDE_THEME.colors.foreground }}>wandering-otter</span>
          <span
            style={{
              padding: "1px 6px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              fontSize: "11px",
              fontFamily: CAIDE_THEME.typography.fontMono,
            }}
          >
            main
          </span>
        </div>

        {/* Window Right Action Icons */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "180px", justifyContent: "flex-end" }}>
          {/* Diff Icon */}
          <div style={{ color: CAIDE_THEME.colors.mutedForeground, cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
          </div>
          {/* Preview Toggle Icon */}
          <div
            style={{
              color: showPreviewStage ? "#ffffff" : CAIDE_THEME.colors.mutedForeground,
              cursor: "pointer",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>
          {/* Settings Icon */}
          <div style={{ color: showSettingsModal ? "#ffffff" : CAIDE_THEME.colors.mutedForeground, cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── 2. Main Window Body: Sidebar + Workspace + Preview Stage ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left Sidebar (240px) */}
        <div
          style={{
            width: "240px",
            borderRight: "1px solid rgba(255, 255, 255, 0.06)",
            backgroundColor: "#111111",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "16px 12px",
          }}
        >
          {/* Top Sidebar Area */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Caide App Branding */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 6px" }}>
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <Img src={staticFile("app-icons/default.png")} style={{ width: "22px", height: "22px" }} />
              </div>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Caide
              </span>
            </div>

            {/* Action Buttons: New Chat & Search */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  fontSize: "12px",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New Chat</span>
                </div>
                <span style={{ fontSize: "10px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono }}>
                  ⌘N
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: CAIDE_THEME.colors.mutedForeground,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Search</span>
                </div>
                <span style={{ fontSize: "10px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono }}>
                  ⌘K
                </span>
              </div>
            </div>

            {/* Projects List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: CAIDE_THEME.colors.subtleForeground, padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Projects
              </div>

              {/* Active Project: wandering-otter */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                <Img src={staticFile("framework-icons/react-native.png")} style={{ width: "15px", height: "15px" }} />
                <span style={{ flex: 1 }}>wandering-otter</span>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: CAIDE_THEME.colors.emerald }} />
              </div>

              {/* Other Projects */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  color: CAIDE_THEME.colors.mutedForeground,
                  fontSize: "12px",
                }}
              >
                <Img src={staticFile("framework-icons/flutter.png")} style={{ width: "15px", height: "15px" }} />
                <span>crypto-pulse</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  color: CAIDE_THEME.colors.mutedForeground,
                  fontSize: "12px",
                }}
              >
                <Img src={staticFile("framework-icons/website.png")} style={{ width: "15px", height: "15px" }} />
                <span>market-web</span>
              </div>
            </div>

            {/* Threads List under active project */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: CAIDE_THEME.colors.subtleForeground, padding: "4px 6px", textTransform: "uppercase" }}>
                Chats
              </div>
              <div
                style={{
                  padding: "5px 8px",
                  borderRadius: "5px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: "#ffffff",
                  fontSize: "11.5px",
                  fontWeight: 500,
                }}
              >
                Build crypto tracker app
              </div>
              <div style={{ padding: "5px 8px", fontSize: "11.5px", color: CAIDE_THEME.colors.mutedForeground }}>
                Database tables & schema
              </div>
              <div style={{ padding: "5px 8px", fontSize: "11.5px", color: CAIDE_THEME.colors.mutedForeground }}>
                Push alerts & notifications
              </div>
            </div>
          </div>

          {/* Bottom Sidebar Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: "#27272a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                DT
              </div>
              <span style={{ fontSize: "12px", fontWeight: 500, color: CAIDE_THEME.colors.foreground }}>
                DejiTech
              </span>
            </div>

            <div style={{ color: CAIDE_THEME.colors.mutedForeground, cursor: "pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
          </div>
        </div>

        {/* ─── Center Chat Workspace ─── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            backgroundColor: CAIDE_THEME.colors.bg,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Workspace Sub-header */}
          <div
            style={{
              height: "44px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>
                Build crypto tracker app
              </span>
              <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground }}>
                in ~/caide-apps/wandering-otter
              </span>
            </div>

            {/* Model Selector Pill Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                fontSize: "11.5px",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <span style={{ color: CAIDE_THEME.colors.claude, fontSize: "13px" }}>✦</span>
              <span>claude-3-7-sonnet</span>
              <svg width="9" height="5" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Transcript Area */}
          <div
            style={{
              flex: 1,
              overflowY: "hidden",
              padding: "24px 32px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {/* User Message Bubble */}
            {composerTypedProgress > 0.8 && (
              <div
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "580px",
                  padding: "12px 18px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#ffffff",
                  fontSize: "13.5px",
                  lineHeight: 1.5,
                }}
              >
                {fullPrompt}
              </div>
            )}

            {/* Assistant Reasoning & Tool Execution Rows */}
            {isAgentRunning && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "680px" }}>
                {/* Reasoning Indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: CAIDE_THEME.colors.mutedForeground }}>
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: CAIDE_THEME.colors.claude,
                      opacity: frame % 30 < 15 ? 1 : 0.4,
                    }}
                  />
                  <span>Reasoning & executing tools...</span>
                </div>

                {/* Tool Cards (TimelineWorkEntryRow) */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {tools.map((tool, idx) => {
                    const isDone = idx < completedToolsCount;
                    if (idx > completedToolsCount) return null;

                    return (
                      <div
                        key={tool.title}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: "#161616",
                          border: "1px solid rgba(255, 255, 255, 0.07)",
                          fontSize: "12.5px",
                          color: "#ffffff",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ color: CAIDE_THEME.colors.mutedForeground }}>{tool.icon}</div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{tool.title}</div>
                            <div style={{ fontSize: "10.5px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono, marginTop: "1px" }}>
                              {tool.tool}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono }}>
                            {tool.duration}
                          </span>
                          {isDone ? (
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                backgroundColor: "rgba(16, 185, 129, 0.2)",
                                color: CAIDE_THEME.colors.emerald,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <svg width="10" height="8" viewBox="0 0 11 9" fill="none">
                                <path d="M1.5 4.5L4 7L9.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          ) : (
                            <div
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                border: "1.5px solid rgba(255, 255, 255, 0.3)",
                                borderTopColor: "#ffffff",
                                transform: `rotate(${frame * 12}deg)`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── Bottom Pill Composer (ComposerColumnFrame replica) ─── */}
          <div
            style={{
              padding: "16px 24px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "680px",
                backgroundColor: "#141414",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: CAIDE_THEME.shadows.composer,
                padding: "14px 18px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* Composer Header Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "#ffffff",
                  }}
                >
                  <span style={{ color: CAIDE_THEME.colors.claude }}>✦</span>
                  <span>claude-3-7-sonnet</span>
                  <svg width="8" height="4" viewBox="0 0 10 6" fill="none">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    fontSize: "11px",
                    color: CAIDE_THEME.colors.mutedForeground,
                  }}
                >
                  React Native (Expo)
                </div>

                <div
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    fontSize: "11px",
                    color: CAIDE_THEME.colors.mutedForeground,
                  }}
                >
                  High Thinking
                </div>
              </div>

              {/* Composer Input Area */}
              <div
                style={{
                  minHeight: "44px",
                  fontSize: "13.5px",
                  lineHeight: 1.45,
                  color: displayedPrompt ? "#ffffff" : CAIDE_THEME.colors.subtleForeground,
                  display: "flex",
                  alignItems: "flex-start",
                }}
              >
                <span>{displayedPrompt || "Ask Caide to build anything..."}</span>
                {composerTypedProgress > 0 && composerTypedProgress < 1 && (
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

              {/* Composer Bottom Toolbar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: CAIDE_THEME.colors.mutedForeground }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                  <span style={{ fontSize: "11px", color: CAIDE_THEME.colors.subtleForeground, fontFamily: CAIDE_THEME.typography.fontMono }}>
                    ~/caide-apps/wandering-otter
                  </span>
                </div>

                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    color: "#0e0e0e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 3. Right Dock: PreviewStage (Fixed 672px / Dynamic) ─── */}
        {previewStageProgress > 0 && (
          <div
            style={{
              width: `${previewWidth}px`,
              borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
              backgroundColor: "#111111",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Preview Stage Header (100% exact copy of PreviewStage.tsx) */}
            <div
              style={{
                height: "44px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
              }}
            >
              {/* Viewport Modes */}
              <div style={{ display: "flex", gap: "4px" }}>
                {["Phone", "Tablet", "Desktop"].map((mode, i) => (
                  <div
                    key={mode}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "5px",
                      backgroundColor: i === 0 ? "rgba(255, 255, 255, 0.1)" : "transparent",
                      color: i === 0 ? "#ffffff" : CAIDE_THEME.colors.mutedForeground,
                      fontSize: "11px",
                      fontWeight: i === 0 ? 600 : 400,
                    }}
                  >
                    {mode}
                  </div>
                ))}
              </div>

              {/* Action Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: CAIDE_THEME.colors.mutedForeground }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
            </div>

            {/* Device Screen Body */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                backgroundColor: "#0d0e12",
              }}
            >
              {/* iPhone Device Frame */}
              <div
                style={{
                  width: "300px",
                  height: "600px",
                  backgroundColor: "#000000",
                  borderRadius: "42px",
                  border: "3px solid #27272a",
                  boxShadow: CAIDE_THEME.shadows.device,
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Dynamic Island */}
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "80px",
                    height: "20px",
                    backgroundColor: "#000000",
                    borderRadius: "20px",
                    zIndex: 20,
                  }}
                />

                {/* Status Bar */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 14px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#ffffff",
                    zIndex: 10,
                  }}
                >
                  <span>9:41</span>
                  <span>5G</span>
                </div>

                {/* Live App: CryptoPulse */}
                <div style={{ flex: 1, padding: "16px 8px 8px 8px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", color: CAIDE_THEME.colors.subtleForeground, textTransform: "uppercase" }}>
                        Portfolio
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#ffffff" }}>
                        {is1W ? "$54,910.80" : "$48,290.45"}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        color: CAIDE_THEME.colors.emerald,
                        fontSize: "10.5px",
                        fontWeight: 600,
                      }}
                    >
                      +14.8%
                    </div>
                  </div>

                  {/* Candlestick SVG Chart */}
                  <div style={{ height: "110px", width: "100%", position: "relative" }}>
                    <svg width="100%" height="100%" viewBox="0 0 300 120" fill="none">
                      <path d={chartPath} stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Timeframe switcher buttons */}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
                    {["1D", "1W", "1M", "1Y", "ALL"].map((tf) => (
                      <div
                        key={tf}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor:
                            (tf === "1D" && !is1W) || (tf === "1W" && is1W)
                              ? "rgba(255, 255, 255, 0.15)"
                              : "transparent",
                          color:
                            (tf === "1D" && !is1W) || (tf === "1W" && is1W)
                              ? "#ffffff"
                              : CAIDE_THEME.colors.subtleForeground,
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        {tf}
                      </div>
                    ))}
                  </div>

                  {/* Token Rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                    {[
                      { name: "Bitcoin", sym: "BTC", price: "$96,420.00", change: "+4.2%" },
                      { name: "Ethereum", sym: "ETH", price: "$3,480.12", change: "+6.8%" },
                      { name: "Solana", sym: "SOL", price: "$210.80", change: "+18.4%" },
                    ].map((coin) => (
                      <div
                        key={coin.sym}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(255, 255, 255, 0.04)",
                          fontSize: "11px",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: "#ffffff" }}>{coin.name}</div>
                          <div style={{ fontSize: "9.5px", color: CAIDE_THEME.colors.subtleForeground }}>{coin.sym}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 600, color: "#ffffff" }}>{coin.price}</div>
                          <div style={{ fontSize: "9.5px", color: CAIDE_THEME.colors.emerald }}>{coin.change}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
