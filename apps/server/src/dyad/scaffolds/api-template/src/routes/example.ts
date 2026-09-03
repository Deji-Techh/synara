/**
 * Example route demonstrating the recommended patterns for CAIDE API routes:
 *
 *   - Zod input validation via @hono/zod-validator
 *   - requireAuth() middleware
 *   - Paginated list responses
 *   - Per-route rate limiting
 *   - Standard { data, error, requestId } envelope
 *
 * INSTRUCTIONS FOR THE AI:
 *   1. Rename or copy this file to match your resource (e.g. posts.ts, todos.ts)
 *   2. Replace the schema and TODO comments with your actual Drizzle queries
 *   3. Register the routes in src/app.ts:
 *        import { exampleRoutes } from "./routes/example";
 *        app.route("/api", exampleRoutes);
 *   4. Delete this comment block
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import { success, error } from "../lib/response";

// ---------------------------------------------------------------------------
// Validation schemas — replace with your domain model
// ---------------------------------------------------------------------------

const CreateItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
});

const ItemIdSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const exampleRoutes = new Hono();

// Apply rate limiting to all routes in this file
exampleRoutes.use("*", rateLimit({ windowMs: 60_000, max: 60 }));

/**
 * GET /api/items?page=1&pageSize=20
 * Returns a paginated list of items for the authenticated user.
 */
exampleRoutes.get("/items", requireAuth(), async (c) => {
  const requestId = c.get("requestId") ?? "unknown";
  const pagination = parsePagination(c);

  // TODO: Replace with your actual DB query, e.g.:
  // const user = c.get("user");
  // const [rows, countResult] = await Promise.all([
  //   db.select().from(items)
  //     .where(eq(items.userId, user.id))
  //     .limit(pagination.pageSize)
  //     .offset(pagination.offset),
  //   db.select({ count: count() }).from(items).where(eq(items.userId, user.id)),
  // ]);
  // return c.json(paginatedResponse(rows, countResult[0].count, pagination, requestId));

  return c.json(paginatedResponse([], 0, pagination, requestId));
});

/**
 * GET /api/items/:id
 * Returns a single item by UUID.
 */
exampleRoutes.get(
  "/items/:id",
  requireAuth(),
  zValidator("param", ItemIdSchema),
  async (c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const { id } = c.req.valid("param");

    // TODO: Replace with your actual DB query
    // const item = await db.query.items.findFirst({ where: eq(items.id, id) });
    // if (!item) return c.json(error("NOT_FOUND", "Item not found", requestId), 404);
    // return c.json(success(item, requestId));

    return c.json(
      error("NOT_FOUND", `Item ${id} not found`, requestId),
      404,
    );
  },
);

/**
 * POST /api/items
 * Create a new item.
 */
exampleRoutes.post(
  "/items",
  requireAuth(),
  zValidator("json", CreateItemSchema),
  async (c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const body = c.req.valid("json");

    // TODO: Replace with your actual DB insert, e.g.:
    // const user = c.get("user");
    // const [item] = await db
    //   .insert(items)
    //   .values({ ...body, userId: user.id })
    //   .returning();
    // return c.json(success(item, requestId), 201);

    return c.json(
      success({ title: body.title, description: body.description ?? null, id: "placeholder-replace-with-db-insert" }, requestId),
      201,
    );
  },
);

/**
 * DELETE /api/items/:id
 * Delete an item.
 */
exampleRoutes.delete(
  "/items/:id",
  requireAuth(),
  zValidator("param", ItemIdSchema),
  async (c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const { id } = c.req.valid("param");

    // TODO: Replace with your actual DB delete
    // const [deleted] = await db.delete(items).where(eq(items.id, id)).returning();
    // if (!deleted) return c.json(error("NOT_FOUND", "Item not found", requestId), 404);
    // return c.json(success({ deleted: true }, requestId));

    return c.json(
      error("NOT_FOUND", `Item ${id} not found`, requestId),
      404,
    );
  },
);
