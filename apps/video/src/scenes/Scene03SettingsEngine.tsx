// FILE: Scene03SettingsEngine.tsx
// Purpose: Scene 3 — Under the hood: Caide's Provider Routing and Databases
// Layer: Video scene

import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { BackgroundGlow } from "../components/BackgroundGlow";
import { CaideWindowShell } from "../components/CaideWindowShell";
import { CaideSettings } from "../components/CaideSettings";

export const Scene03SettingsEngine: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 240], [0.94, 0.98]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundGlow intensity={1.1} />

      {/* Caide Desktop App Window with Settings Modal */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
        }}
      >
        <CaideWindowShell />

        {/* Modal Backdrop & Authentic Caide Settings Dialog */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <CaideSettings />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
