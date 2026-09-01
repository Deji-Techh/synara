import * as Pipeable from "effect/Pipeable";

if (typeof Error !== "undefined" && !("pipe" in Error.prototype)) {
  Object.defineProperty(Error.prototype, "pipe", {
    value: Pipeable.Prototype.pipe,
    writable: true,
    configurable: true,
  });
}
