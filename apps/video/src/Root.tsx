import React from "react";
import { Composition } from "remotion";
import "./index.css";
import { MainVideo } from "./MainVideo";
import { FPS } from "./constants/timings";

// Total duration = Sum of sequence durations minus transition overlaps:
// (240 + 360 + 360 + 360 + 300 + 240) - (20 + 25 + 20 + 25 + 20) = 1750 frames (~29.16s @ 60fps)
const TOTAL_FRAMES = 1750;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 16:9 Landscape - Master Launch Video (Web, Desktop, YouTube) */}
      <Composition
        id="CaideLaunch"
        component={MainVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />

      {/* 9:16 Vertical - Social Short Video (X, Reels, TikTok) */}
      <Composition
        id="CaideLaunchShort"
        component={MainVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
