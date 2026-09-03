# Persistent Motion Storyboard

Create `.caide/motion-spec.json` before substantial animated implementation.

For each transition record:

- stable kebab-case ID;
- trigger;
- source and destination states;
- user-facing purpose;
- hierarchy: feedback, status, continuity, navigation, or delight;
- technique;
- engine;
- elements and their from/to roles;
- duration, delay, easing, and optional spring values;
- interruption and reversal behaviour;
- rapid repeated-input behaviour;
- reduced-motion technique and how meaning remains available;
- target FPS, maximum long task, and whether layout animation is allowed.

Also define:

- global motion character and intensity;
- primary and allowed engines;
- prohibited motion patterns;
- instant, press, quick, standard, navigation, expressive, ease, and spring tokens;
- asset source, fallback, and byte budget;
- routes and safe audit triggers;
- executable primary core flows with selectors, actions, expected visibility/text, and timeouts;
- normal, reduced, slow diagnostic, repeated-input, CPU-throttled, and trace modes;
- minimum motion and core-flow scores plus performance thresholds.

An approved storyboard must contain feedback, navigation, and status/continuity
coverage for the primary flow. Every transition must be interruptible and have a
meaning-preserving reduced-motion fallback.
