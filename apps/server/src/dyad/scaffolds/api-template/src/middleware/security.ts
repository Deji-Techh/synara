import type { MiddlewareHandler } from "hono";
import { env } from "../lib/env";

/**
 * Security headers middleware.
 *
 * In development: minimal headers to avoid blocking HMR / local previews.
 * In production: full hardened header set.
 *
 * Add to your app after cors() and before your routes:
 *   app.use("*", securityHeaders());
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    const isProd = env.NODE_ENV === "production";

    // Prevent MIME-type sniffing
    c.header("X-Content-Type-Options", "nosniff");

    // Deny framing to prevent clickjacking
    c.header("X-Frame-Options", "DENY");

    // Disable legacy XSS filter (modern browsers use CSP instead)
    c.header("X-XSS-Protection", "0");

    if (isProd) {
      // Force HTTPS for 1 year, include subdomains
      c.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );

      // Restrictive CSP: API only serves JSON so default-src none is safe.
      // Adjust this if you serve HTML, images, or other resources.
      c.header(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'",
      );

      // Don't leak the referrer to cross-origin requests
      c.header("Referrer-Policy", "strict-origin-when-cross-origin");

      // Prevent browsers from using deprecated features
      c.header(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()",
      );

      // Remove the server banner
      c.header("X-Powered-By", "");
    }
  };
}
