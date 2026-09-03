import type { MiddlewareHandler } from "hono";
import { getSession } from "../auth";
import { error } from "../lib/response";

declare module "hono" {
  interface ContextVariableMap {
    user: NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>["session"];
  }
}

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.get("requestId") ?? "unknown";
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const session = await getSession(token);
    if (!session?.user) {
      return c.json(
        error("UNAUTHORIZED", "Authentication required", requestId),
        401,
      );
    }

    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
}

export function optionalAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const session = await getSession(token);
    if (session?.user) {
      c.set("user", session.user);
      c.set("session", session.session);
    }
    await next();
  };
}
