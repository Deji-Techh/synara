import type { MiddlewareHandler } from "hono";
import crypto from "node:crypto";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const id = crypto.randomUUID();
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await next();
  };
}
