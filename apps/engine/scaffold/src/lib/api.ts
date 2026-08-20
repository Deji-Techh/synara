/**
 * Typed API client for the CAIDE backend (api/).
 *
 * This client handles auth tokens, request IDs, and the
 * { data, error, requestId } response envelope used by every API route.
 *
 * Usage:
 *   import { api } from "@/lib/api";
 *
 *   // Unauthenticated request
 *   const result = await api.get<{ status: string }>("/health");
 *
 *   // Authenticated request (pass the session token from Neon Auth)
 *   const posts = await api.get<Post[]>("/posts", { token });
 *
 *   // POST with JSON body
 *   const post = await api.post<Post>("/posts", { title: "Hello" }, { token });
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Response envelope shape (mirrors scaffold-api/src/lib/response.ts)
// ---------------------------------------------------------------------------

interface ApiSuccess<T> {
  data: T;
  error: null;
  requestId: string;
}

interface ApiError {
  data: null;
  error: { code: string; message: string };
  requestId: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Bearer token from Neon Auth (or any other session token). */
  token?: string | null;
  /** Request body for POST/PUT/PATCH. Will be JSON.stringify'd. */
  body?: unknown;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiRequestError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;

  constructor({
    code,
    message,
    requestId,
    status,
  }: {
    code: string;
    message: string;
    requestId: string;
    status: number;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { token, body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const envelope = (await res.json()) as ApiResponse<T>;

  if (envelope.error !== null) {
    throw new ApiRequestError({
      code: envelope.error.code,
      message: envelope.error.message,
      requestId: envelope.requestId,
      status: res.status,
    });
  }

  return envelope.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, { ...options, body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, { ...options, body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),

  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};
