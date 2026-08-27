// FILE: useSmoothStreamedText.ts
// Purpose: Reveal streamed assistant text at a steady, adaptive cadence so tokens appear
//          fluidly instead of in the network clumps that land in the store.
// Layer: Web UI streaming primitive
// Exports: useSmoothStreamedText, stepSmoothReveal (pure stepper, unit-tested),
//          adaptEmitInterval (pure cadence governor, unit-tested)
// Why: The transport coalesces deltas into one store update per ~40-100ms, so rendering
//      each clump verbatim looks choppy. This hook drains the already-delivered buffer on
//      requestAnimationFrame at a velocity that adapts to the backlog, low-pass-smooths
//      that velocity so there are no jarring speed jumps, and sleeps between bursts once
//      it catches up. It feeds the same text ChatMarkdown already defers, so the markdown
//      re-parse stays coalesced by useDeferredValue: this hook governs *cadence*, not
//      parse cost.
//      Commit cadence is adaptive: the reveal float advances every frame at the display
//      refresh rate, while React commits target BASE_EMIT_INTERVAL_MS (per-frame on 60Hz
//      displays, every-other-frame on 120Hz). The tick probes frame pacing — a frame
//      delta following an emitting frame includes the commit's render cost — and backs
//      the interval off (up to MAX_EMIT_INTERVAL_MS) when that extra cost steals frame
//      budget, so fast machines get per-frame commits while weak ones degrade gracefully
//      instead of dropping frames.

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";

// Drain the current backlog over this window. Kept above the ~40ms network flush so a
// small backlog cushion always remains and the reveal tracks inflow without running dry.
const DRAIN_WINDOW_SECONDS = 0.1;
// Hard ceiling so a single huge flush (e.g. a pasted code block) reveals fast but bounded
// rather than snapping in all at once.
const MAX_CHARS_PER_SECOND = 3000;
// Low-pass factor: how aggressively the live velocity chases the target velocity each
// frame. Smaller is smoother but laggier; ~0.3 ≈ a ~55ms time constant at 60fps, which
// tracks the stream closely without feeling floaty.
const VELOCITY_LERP = 0.3;
// Clamp per-frame delta so returning from a backgrounded tab (rAF paused) does not dump
// the whole backlog in a single frame.
const MAX_FRAME_SECONDS = 0.05;
// Base spacing between React commits: 16ms ≈ 60fps, compositor-friendly. The reveal float
// still advances every frame; this only throttles how often the growing prefix hits React.
export const BASE_EMIT_INTERVAL_MS = 16;
// Ceiling for the adaptive commit interval under sustained render pressure.
export const MAX_EMIT_INTERVAL_MS = 40;
// A frame delta exceeding the idle display baseline by this much (ms) means the commit
// cost is stealing frame budget -> back the interval off.
const BACKOFF_EXTRA_COST_MS = 8;
// Below this extra cost the interval can safely tighten back toward the base.
const RECOVER_EXTRA_COST_MS = 2;
// Hysteresis: how far the interval moves per adjustment, keeping it from oscillating.
const INTERVAL_ADJUST_FACTOR = 1.5;
// Re-evaluate the interval after this many emitting frames have been sampled. 6 frames
// ≈ 100ms at 60fps, so backoff kicks in before the first scroll jank is perceptible.
const ADAPT_SAMPLE_FRAMES = 6;

/**
 * Mutable per-message reveal state. Owned by the hook via refs; the pure stepper below
 * mutates it in place so the rAF loop allocates nothing per frame.
 */
export interface SmoothRevealState {
  /** Revealed character count, accumulated as a float across frames. */
  shown: number;
  /** Smoothed reveal velocity in chars/second. */
  velocity: number;
  /** Timestamp (ms) of the previous frame; 0 marks the start of a fresh burst. */
  lastFrameAt: number;
  /** Timestamp (ms) of the last emitted commit; 0 forces the next emit immediately. */
  lastEmitAt: number;
}

export function createSmoothRevealState(shown: number): SmoothRevealState {
  return { shown, velocity: 0, lastFrameAt: 0, lastEmitAt: 0 };
}

export interface SmoothRevealStep {
  /** Floored character count to commit this frame, or null when no commit is due. */
  emitCount: number | null;
  /** True when the backlog is drained and the loop should sleep until the next flush. */
  done: boolean;
}

/**
 * Advance the reveal by one animation frame. Mutates `state` in place and reports
 * whether this frame should commit a longer prefix and whether the loop can sleep.
 *
 * Emission is quantized: a commit is due only when the floored count advanced AND
 * either `emitIntervalMs` elapsed since the last commit, the reveal just caught
 * up with the target (never hold back the final characters of a burst), or no commit
 * has happened yet in this burst.
 */
export function stepSmoothReveal(
  state: SmoothRevealState,
  nowMs: number,
  targetLength: number,
  emittedCount: number,
  emitIntervalMs: number,
): SmoothRevealStep {
  const previousFrameAt = state.lastFrameAt;
  const dt = previousFrameAt ? Math.min((nowMs - previousFrameAt) / 1000, MAX_FRAME_SECONDS) : 0;
  state.lastFrameAt = nowMs;

  if (state.shown > targetLength) state.shown = targetLength;

  const backlog = targetLength - state.shown;
  if (backlog <= 0) {
    state.velocity = 0;
    state.lastFrameAt = 0;
    return { emitCount: null, done: true };
  }

  const targetVelocity = Math.min(MAX_CHARS_PER_SECOND, backlog / DRAIN_WINDOW_SECONDS);
  state.velocity += (targetVelocity - state.velocity) * VELOCITY_LERP;
  state.shown = Math.min(targetLength, state.shown + state.velocity * dt);
  // Snap the sub-character tail: velocity decays geometrically as the backlog shrinks,
  // so without this the reveal would converge asymptotically and the final commit could
  // never fire. A fractional trailing character is invisible anyway.
  const remainingAfterStep = targetLength - state.shown;
  if (remainingAfterStep > 0 && remainingAfterStep < 1) {
    state.shown = targetLength;
  }

  const nextCount = Math.floor(state.shown);
  const caughtUp = nextCount >= targetLength;
  const emitDue =
    nextCount !== emittedCount &&
    (caughtUp || state.lastEmitAt === 0 || nowMs - state.lastEmitAt >= emitIntervalMs);
  if (emitDue) {
    state.lastEmitAt = nowMs;
  }

  const done = targetLength - state.shown <= 0;
  if (done) {
    state.velocity = 0;
    state.lastFrameAt = 0;
  }
  return { emitCount: emitDue ? nextCount : null, done };
}

/**
 * Adjust the React-commit interval based on the measured extra frame cost (observed
 * frame delta minus the idle display baseline). Applied with hysteresis so the cadence
 * does not oscillate between bursts.
 */
export function adaptEmitInterval(current: number, extraCostMs: number): number {
  if (extraCostMs > BACKOFF_EXTRA_COST_MS) {
    return Math.min(MAX_EMIT_INTERVAL_MS, Math.round(current * INTERVAL_ADJUST_FACTOR));
  }
  if (extraCostMs < RECOVER_EXTRA_COST_MS && current > BASE_EMIT_INTERVAL_MS) {
    return Math.max(BASE_EMIT_INTERVAL_MS, Math.round(current / INTERVAL_ADJUST_FACTOR));
  }
  return current;
}

/**
 * Smoothly reveal `text` while `isStreaming` is true.
 *
 * - Returns `text` unchanged when not streaming or under prefers-reduced-motion, so
 *   completed messages and reduced-motion users see the exact text with zero animation.
 * - Snaps to the full text the instant streaming ends (no trailing typewriter once the
 *   agent is done).
 * - Text already present on mount is shown immediately; only newly-arriving deltas animate.
 */
export function useSmoothStreamedText(text: string, isStreaming: boolean): string {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const animate = isStreaming && !reduceMotion;

  const [revealed, setRevealed] = useState(text);

  // Latest full text, mirrored post-commit so the rAF loop always reads the current value
  // without re-subscribing the animation effect on every ~40ms delta.
  const targetRef = useRef(text);
  const stateRef = useRef<SmoothRevealState>(createSmoothRevealState(text.length));
  // Character count last pushed to React state — guards against redundant setState when the
  // floored count has not advanced.
  const emittedRef = useRef(text.length);
  // Current commit interval, adapted to measured render pressure while streaming.
  const intervalRef = useRef(BASE_EMIT_INTERVAL_MS);
  // Frame-pacing probes: idle baseline (EMA of frame deltas after non-emitting frames)
  // and the extra cost of emitting frames, plus how many emitting frames were sampled.
  const idleFrameMsRef = useRef(0);
  const busyExtraMsRef = useRef(0);
  const adaptSampleCountRef = useRef(0);
  const lastTickAtRef = useRef(0);
  const emittedLastFrameRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<(now: number) => void>(() => undefined);

  const cancelFrame = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const scheduleFrame = () => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame((now) => {
      rafRef.current = null;
      tickRef.current(now);
    });
  };

  // Installed in an effect (not during render — that write would make the
  // whole hook ineligible for React Compiler). The tick reads everything
  // through refs, so a mount-time install stays permanently fresh.
  useEffect(() => {
    tickRef.current = (now: number) => {
      const target = targetRef.current;
      const step = stepSmoothReveal(
        stateRef.current,
        now,
        target.length,
        emittedRef.current,
        intervalRef.current,
      );

      // Frame-pacing probe. A delta measured after an emitting frame includes that
      // commit's render cost; deltas after non-emitting frames reflect the display
      // refresh rate and feed the idle baseline.
      const lastTick = lastTickAtRef.current;
      if (lastTick !== 0) {
        const frameDelta = Math.min(now - lastTick, MAX_FRAME_SECONDS * 1000);
        if (emittedLastFrameRef.current && idleFrameMsRef.current > 0) {
          const extra = Math.max(0, frameDelta - idleFrameMsRef.current);
          busyExtraMsRef.current = busyExtraMsRef.current * 0.85 + extra * 0.15;
          adaptSampleCountRef.current += 1;
          if (adaptSampleCountRef.current >= ADAPT_SAMPLE_FRAMES) {
            intervalRef.current = adaptEmitInterval(intervalRef.current, busyExtraMsRef.current);
            busyExtraMsRef.current = 0;
            adaptSampleCountRef.current = 0;
          }
        } else if (!emittedLastFrameRef.current) {
          idleFrameMsRef.current =
            idleFrameMsRef.current === 0
              ? frameDelta
              : idleFrameMsRef.current * 0.9 + frameDelta * 0.1;
        }
      }
      lastTickAtRef.current = now;
      emittedLastFrameRef.current = step.emitCount !== null;

      if (step.emitCount !== null) {
        emittedRef.current = step.emitCount;
        setRevealed(step.emitCount >= target.length ? target : target.slice(0, step.emitCount));
      }
      if (!step.done) {
        scheduleFrame();
      } else {
        // Sleep until the next flush; reset probe state so the next burst starts fresh.
        lastTickAtRef.current = 0;
        emittedLastFrameRef.current = false;
      }
    };
  }, [scheduleFrame]);

  useEffect(() => {
    const previousTarget = targetRef.current;
    const isAppendOnly = text.length >= previousTarget.length && text.startsWith(previousTarget);
    targetRef.current = text;

    if (!animate || !isAppendOnly) {
      cancelFrame();
      stateRef.current = createSmoothRevealState(text.length);
      emittedRef.current = text.length;
      intervalRef.current = BASE_EMIT_INTERVAL_MS;
      idleFrameMsRef.current = 0;
      busyExtraMsRef.current = 0;
      adaptSampleCountRef.current = 0;
      lastTickAtRef.current = 0;
      emittedLastFrameRef.current = false;
      setRevealed(text);
      return;
    }

    if (text.length > stateRef.current.shown) {
      scheduleFrame();
    }
  }, [animate, cancelFrame, scheduleFrame, text]);

  useEffect(() => () => cancelFrame(), [cancelFrame]);

  return animate ? revealed : text;
}
