import React from "react";
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
  );
};
