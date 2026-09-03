import type { ErrorHandler } from "hono";
import { error } from "../lib/response";

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  console.error(`[${requestId}] Unhandled error:`, err);
  return c.json(
    error("INTERNAL_ERROR", "An unexpected error occurred", requestId),
    500,
  );
};
