# Provision a production backend for a new app

Use this guide when the user wants to build a new app that needs
persistence, authentication, API routes, or any server-side logic.
Do NOT use for frontend-only apps.

## Detection

The app needs a backend when the user's request mentions any of:

- user accounts, login, signup, authentication
- saving, storing, persisting data
- posts, messages, comments, likes, feeds
- payments, checkout, subscriptions
- realtime, notifications, push
- database, API, server, backend
- uploading files, images, media

## Backend scaffold

CAIDE ships a production-grade backend scaffold at `scaffold-api/`.
When the user needs a backend, you MUST scaffold it as follows:

```text
api/
  src/
    index.ts             entry point
    app.ts               Hono app with middleware
    db/
      index.ts           Neon + Drizzle connection
      schema.ts          database tables (user-edited)
      migrate.ts         migration runner
    auth/
      index.ts           Neon Auth session lookup
    middleware/
      auth.ts            requireAuth / optionalAuth middleware
      error.ts           global error handler
      request-id.ts      request ID middleware
    routes/
      health.ts          health check (working out of the box)
    lib/
      env.ts             Zod-validated environment
      response.ts        { data, error, requestId } envelope
  package.json
  tsconfig.json
  drizzle.config.ts
  Dockerfile
  vitest.config.ts
```

## Workflow

### 1. Create the directory structure

Create `api/` at the project root. For each file in the scaffold,
use `write_file` to create it with the content from `scaffold-api/`.
Create ALL of the following files (the foundation is pre-built and
pre-tested — you MUST NOT skip any of them):

- `api/package.json`
- `api/tsconfig.json`
- `api/drizzle.config.ts`
- `api/.env.example`
- `api/vitest.config.ts`
- `api/Dockerfile`
- `api/src/index.ts`
- `api/src/app.ts`
- `api/src/lib/env.ts`
- `api/src/lib/response.ts`
- `api/src/db/index.ts`
- `api/src/db/schema.ts`
- `api/src/db/migrate.ts`
- `api/src/auth/index.ts`
- `api/src/middleware/request-id.ts`
- `api/src/middleware/error.ts`
- `api/src/middleware/auth.ts`
- `api/src/routes/health.ts`

### 2. Provision a Neon database

1. If the user does not have a Neon account connected, ask them to
   connect one via Settings → Neon.
2. Once connected, use the `create_neon_branch` tool (or equivalent)
   to create a new database for this app.
3. Get the connection string (`DATABASE_URL`) and tell the user to
   add it to their environment. Set `NEON_AUTH_SECRET` to a random
   32+ character string.

### 3. Customize the database schema

Open `api/src/db/schema.ts`. The scaffold includes a `users` table
that matches Neon Auth's user model. Add tables for the app's
domain model. For example, for a social media app:

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

After adding tables, generate migrations:

```
npm --prefix api run db:generate
```

### 4. Add API routes

Create route files in `api/src/routes/`. Each routes file should:

1. Export a `new Hono()` instance
2. Use Zod to validate inputs
3. Return the `{ data, error, requestId }` envelope
4. Use `requireAuth()` middleware for authenticated routes

Example:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { posts } from "../db/schema";
import { success, error } from "../lib/response";

const postRoutes = new Hono();

postRoutes.get("/posts", requireAuth(), async (c) => {
  const requestId = c.get("requestId") ?? "unknown";
  const all = await db.select().from(posts);
  return c.json(success(all, requestId));
});

postRoutes.post(
  "/posts",
  requireAuth(),
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(10000),
    }),
  ),
  async (c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const user = c.get("user");
    const body = c.req.valid("json");
    const [post] = await db
      .insert(posts)
      .values({ ...body, authorId: user.id })
      .returning();
    return c.json(success(post, requestId), 201);
  },
);

export { postRoutes };
```

Register the routes in `api/src/app.ts`:

```ts
import { postRoutes } from "./routes/posts";
app.route("/api", postRoutes);
```

### 5. Wire the frontend

Add a typed API client in the frontend app:

```ts
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function api<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (options?.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "Request failed");
  return body.data;
}
```

### 6. Add auth UI

Use the `add-authentication` guide (call `read_guide`) to add
Neon Auth sign-up/login pages to the frontend. The auth token
returned by Neon Auth is the `Bearer` token the API expects.

### 7. Verify

1. Run `npm --prefix api run typecheck`
2. Run `npm --prefix api run db:generate` (schema changes)
3. Start the API with `npm --prefix api run dev`
4. Verify `/api/health` returns 200
5. Verify authenticated routes return 401 without a token
6. Verify the frontend can create and read data

## Do NOT

- Do NOT skip the scaffold files — every file serves a purpose
- Do NOT use a different web framework — use Hono (it is
  pre-configured in the scaffold)
- Do NOT use a different response envelope — use the
  `{ data, error, requestId }` format
- Do NOT add secrets or hardcoded credentials to the code
- Do NOT generate mock/placeholder data in API responses —
  return empty arrays or null instead
- Do NOT skip auth for routes that need it — use `requireAuth()`
