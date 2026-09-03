import { Hono } from "hono";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";
import { success, error } from "../lib/response";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const requestId = c.get("requestId") ?? "unknown";

  try {
    const sql = neon(env.DATABASE_URL);
    await sql`SELECT 1`;
    return c.json(
      success(
        { status: "healthy", timestamp: new Date().toISOString() },
        requestId,
      ),
    );
  } catch (err) {
    console.error(`[${requestId}] Health check failed:`, err);
    return c.json(
      error("SERVICE_UNAVAILABLE", "Database connection failed", requestId),
      503,
    );
  }
});
