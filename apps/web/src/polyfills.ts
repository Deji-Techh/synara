import * as Pipeable from "effect/Pipeable";

if (typeof Error !== "undefined" && !("pipe" in Error.prototype)) {
  Object.defineProperty(Error.prototype, "pipe", {
    value: Pipeable.Prototype.pipe,
    writable: true,
    configurable: true,
  });
}

if (typeof Object !== "undefined" && !("pipe" in Object.prototype)) {
  Object.defineProperty(Object.prototype, "pipe", {
    value: Pipeable.Prototype.pipe,
    writable: true,
    configurable: true,
  });
}

if (typeof window !== "undefined") {
  (window as any).__caideEffectPolyfillLoaded = true;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).__caideEffectPolyfillLoaded = true;
}

console.info("[caide] Effect polyfills initialized successfully.");
export const __polyfillLoaded = true;
