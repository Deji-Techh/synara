import React from "react";
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Scene01Hook } from "./scenes/Scene01Hook";
import { Scene02HomeFrameworks } from "./scenes/Scene02HomeFrameworks";
import { Scene03SettingsEngine } from "./scenes/Scene03SettingsEngine";
import { Scene04PillComposer } from "./scenes/Scene04PillComposer";
import { Scene05PreviewStage } from "./scenes/Scene05PreviewStage";
import { Scene06Finale } from "./scenes/Scene06Finale";
import { SCENE_DURATIONS, TRANSITION_DURATION } from "./constants/timings";

export const MainVideo: React.FC = () => {
  return (
    <>
      {/* ================= AUDIO DESIGN LAYER ================= */}
      {/* Master Ambient Soundtrack */}
      <Audio src={staticFile("sfx/soundtrack.wav")} volume={0.55} />

      {/* Cinematic Sub-Bass Drops */}
      <Sequence from={15} durationInFrames={90}>
        <Audio src={staticFile("sfx/sub-drop.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={1100} durationInFrames={90}>
        <Audio src={staticFile("sfx/sub-drop.wav")} volume={0.65} />
      </Sequence>
      <Sequence from={1560} durationInFrames={90}>
        <Audio src={staticFile("sfx/sub-drop.wav")} volume={0.75} />
      </Sequence>

      {/* Tactile UI Clicks */}
      <Sequence from={320} durationInFrames={10}>
        <Audio src={staticFile("sfx/click.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={1085} durationInFrames={10}>
        <Audio src={staticFile("sfx/click.wav")} volume={0.6} />
      </Sequence>

      {/* Crystal Chime on App Compile */}
      <Sequence from={1300} durationInFrames={70}>
        <Audio src={staticFile("sfx/chime.wav")} volume={0.5} />
      </Sequence>

      {/* Scene Cut Whooshes */}
      <Sequence from={220} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
      </Sequence>
      <Sequence from={560} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
      </Sequence>
      <Sequence from={920} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
      </Sequence>
      <Sequence from={1280} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
      </Sequence>
      <Sequence from={1540} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
      </Sequence>

      {/* ================= VISUAL SCENE TRANSITIONS ================= */}
      <TransitionSeries>
        {/* Scene 1: The Hook */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.hook}>
          <Scene01Hook />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 2: Authentic Home Page & Frameworks */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.home}>
          <Scene02HomeFrameworks />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />

        {/* Scene 3: Authentic Settings & Engine Power */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.settings}>
          <Scene03SettingsEngine />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 4: Pill Composer & Live Autonomous Prompting */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.composer}>
          <Scene04PillComposer />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />

        {/* Scene 5: Dual Preview Stage & Mobile App Execution */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.preview}>
          <Scene05PreviewStage />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 6: Finale & Call to Action */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.finale}>
          <Scene06Finale />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
