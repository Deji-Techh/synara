/**
 * Pagination utilities for list endpoints.
 *
 * Usage:
 *   import { parsePagination, paginatedResponse } from "../lib/pagination";
 *
 *   app.get("/posts", async (c) => {
 *     const { page, pageSize, offset } = parsePagination(c);
 *     const [rows, total] = await Promise.all([
 *       db.select().from(posts).limit(pageSize).offset(offset),
 *       db.select({ count: count() }).from(posts),
 *     ]);
 *     return c.json(paginatedResponse(rows, total[0].count, { page, pageSize }, requestId));
 *   });
 */

import type { Context } from "hono";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Parse and validate pagination parameters from the request query string.
 * Falls back to safe defaults on invalid input — never throws.
 */
export function parsePagination(c: Context): PaginationParams {
  const query = c.req.query();
  const parsed = PaginationQuerySchema.safeParse(query);
  const { page, pageSize } = parsed.success
    ? parsed.data
    : { page: 1, pageSize: DEFAULT_PAGE_SIZE };

  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Build a standardised paginated response payload.
 *
 * The response envelope follows the same `{ data, error, requestId }` shape
 * used everywhere else in the scaffold, with `data` extended to include the
 * items array and pagination metadata.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  pagination: Pick<PaginationParams, "page" | "pageSize">,
  requestId: string,
): {
  data: { items: T[]; pagination: PaginationMeta };
  error: null;
  requestId: string;
} {
  const { page, pageSize } = pagination;
  const totalPages = Math.ceil(total / pageSize);

  return {
    data: {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
    error: null,
    requestId,
  };
}
