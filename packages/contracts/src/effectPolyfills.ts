import * as Pipeable from "effect/Pipeable";

const pipeFn = Pipeable.Prototype.pipe;

if (typeof globalThis !== "undefined") {
  (globalThis as any).__caideEffectPolyfillsApplied = true;
}

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

export const __polyfillApplied = true;
