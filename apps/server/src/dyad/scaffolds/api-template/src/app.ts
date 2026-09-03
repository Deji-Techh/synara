import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./lib/env";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error";
import { securityHeaders } from "./middleware/security";
import { healthRoutes } from "./routes/health";

const app = new Hono();

// Structured request logging: method, path, status, duration
app.use("*", logger());

// Unique request ID for every request (used in response envelope)
app.use("*", requestId());

// Security headers (HSTS, CSP, etc. — stricter in production)
app.use("*", securityHeaders());

// CORS — origins are already validated as string[] by the Zod env schema
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  }),
);

app.onError(errorHandler);

app.route("/", healthRoutes);

// ---------------------------------------------------------------------------
// ADD YOUR ROUTES HERE
// Import your route files and register them:
//
//   import { postRoutes } from "./routes/posts";
//   app.route("/api", postRoutes);
//
// See scaffold-api/src/routes/health.ts for a reference implementation.
// See provision-backend.md guide for the complete workflow.
// ---------------------------------------------------------------------------

export { app };
export type App = typeof app;
