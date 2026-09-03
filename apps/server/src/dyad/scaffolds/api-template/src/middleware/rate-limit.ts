import type { MiddlewareHandler } from "hono";

/**
 * Simple in-process rate limiter using a sliding window per key.
 *
 * For production multi-instance deployments, replace the local Map with
 * a shared store such as Redis or Neon Serverless (ephemeral KV via SQL).
 *
 * Usage:
 *   import { rateLimit } from "../middleware/rate-limit";
 *
 *   // 10 requests per minute per IP
 *   app.use("/api/auth/*", rateLimit({ windowMs: 60_000, max: 10 }));
 *
 *   // 100 requests per minute per authenticated user
 *   app.use("/api/posts", rateLimit({ windowMs: 60_000, max: 100, keyFn: (c) => c.get("user")?.id }));
 */

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Maximum number of requests allowed per key per window (default: 100) */
  max?: number;
  /** Function to extract the rate-limit key from the request context.
   *  Defaults to the client IP address. */
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string | undefined;
  /** Error message returned to the client when the limit is exceeded. */
  message?: string;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export function rateLimit({
  windowMs = 60_000,
  max = 100,
  keyFn,
  message = "Too many requests. Please try again later.",
}: RateLimitOptions = {}): MiddlewareHandler {
  const store = new Map<string, WindowState>();

  // Evict expired windows periodically so the map doesn't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }, windowMs).unref();

  return async (c, next) => {
    const defaultKey =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("cf-connecting-ip") ??
      "unknown";

    const key = (keyFn ? keyFn(c) : undefined) ?? defaultKey;

    const now = Date.now();
    let state = store.get(key);

    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      store.set(key, state);
    }

    state.count++;
    const remaining = Math.max(0, max - state.count);
    const retryAfter = Math.ceil((state.resetAt - now) / 1000);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      c.header("Retry-After", String(retryAfter));
      const requestId = c.get("requestId") ?? "unknown";
      return c.json(
        { data: null, error: { code: "RATE_LIMITED", message }, requestId },
        429,
      );
    }

    await next();
  };
}
