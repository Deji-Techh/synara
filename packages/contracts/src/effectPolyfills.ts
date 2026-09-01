import * as Pipeable from "effect/Pipeable";

// Ensure side effect not tree-shaken
// @ts-ignore
if (typeof globalThis !== "undefined") (globalThis as any).__caideEffectPolyfillsApplied = true;

if (typeof Error !== "undefined" && !("pipe" in Error.prototype)) {
  Object.defineProperty(Error.prototype, "pipe", {
    value: Pipeable.Prototype.pipe,
    writable: true,
    configurable: true,
  });
}
export const __polyfillApplied = true;
