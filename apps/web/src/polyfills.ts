import * as Pipeable from "effect/Pipeable";

const pipeFn = Pipeable.Prototype.pipe;

for (const target of [
  typeof Object !== "undefined" ? Object.prototype : null,
  typeof Error !== "undefined" ? Error.prototype : null,
  typeof Function !== "undefined" ? Function.prototype : null,
  typeof Array !== "undefined" ? Array.prototype : null,
]) {
  if (target && !("pipe" in target)) {
    try {
      Object.defineProperty(target, "pipe", {
        value: pipeFn,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch {}
  }
}

if (typeof window !== "undefined") {
  (window as any).__caideEffectPolyfillLoaded = true;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).__caideEffectPolyfillLoaded = true;
}

console.info("[caide] Effect polyfills initialized successfully.");
export const __polyfillLoaded = true;
