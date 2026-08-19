# Motion Direction and Capability Routing

Motion is part of product architecture. It is not a decorative pass.

## Required decisions

Before implementing substantial interaction, define:

- what state changed;
- why motion helps comprehension, continuity, confirmation, or attention;
- which element carries continuity;
- whether the motion can be interrupted and reversed;
- what rapid repeated input does;
- what reduced motion shows instead;
- the frame, layout-shift, long-task, and asset budgets;
- the smallest engine that can implement the behaviour reliably.

## Engine router

Use `native-css-waapi` for pressed states, short fades, simple reveals, and small
local transitions. It has no package requirement.

Use `motion-react` and install `motion` for shared elements, automatic layout,
gestures, springs, drag, scroll-linked effects, and coordinated React presence.
It is the normal advanced application engine.

Use `dotlottie` and install `@lottiefiles/dotlottie-react` for linear authored
illustrations such as onboarding, empty, loading, and completion scenes. Do not
use it for ordinary component feedback.

Use `rive` and install `@rive-app/react-webgl2` for state-machine-driven
illustration, mascots, interactive branded feedback, and animation responding
to application inputs. Limit simultaneous WebGL canvases and provide a static
fallback.

Use `gsap` and install `gsap` plus `@gsap/react` only for complex SVG timelines,
motion paths, or exceptional cinematic choreography that cannot be expressed
cleanly with Motion. It is not the default route-transition engine.

Use `three` and install `three`, `@react-three/fiber`, and
`@react-three/drei` only when 3D is essential to the product task. Decorative
3D backgrounds are not sufficient justification.

## Timing system

- instant: 0–80ms;
- pressed feedback: 90–130ms;
- quick state: 140–180ms;
- local transition: 200–260ms;
- navigation: 260–340ms;
- expressive completion: 360–500ms and rare.

Longer motion requires explicit task justification. Never make the user wait
for animation before the next valid action.

## Performance contract

Prefer transform and opacity. Avoid animating width, height, top, left, margin,
or padding in routine flows. Avoid `transition: all`. Never use uncontrolled
infinite animation. Cancel animations when their screen unmounts. Test under CPU
throttling, rapid repeated input, normal motion, reduced motion, and diagnostic
slow motion. Record trace evidence for critical transitions.
