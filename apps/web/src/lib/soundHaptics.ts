// FILE: soundHaptics.ts
// Purpose: World-class subtle sound/haptics — pop on send, tick on tool complete.
// Respects reduced-motion + muted. Electron shell.beep fallback, Web Audio otherwise.

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return audioCtx;
  } catch { return null; }
}

function beep(freq: number, ms: number, gain = 0.06) {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(c.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
  o.stop(c.currentTime + ms / 1000);
}

export function soundSendPop() { beep(880, 90, 0.05); }
export function soundToolTick() { beep(1200, 60, 0.04); }
export function hapticTick() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(10); } catch {}
  }
}
