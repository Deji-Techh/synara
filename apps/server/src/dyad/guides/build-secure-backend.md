# Build a secure production backend

Use this guide when an application needs APIs, persistence, privileged
operations, uploads, webhooks, scheduled work, email/SMS, or an integration
that requires a secret.

## Boundary and architecture

1. Keep provider secrets, service-role keys, signing keys, and admin database
   credentials on the server. Browser code may receive only publishable keys.
2. Define a Zod schema for every external request: path parameters, query
   parameters, headers used by the application, and JSON/form bodies.
3. Return a stable response envelope:
   `{ data, error: null, requestId }` on success and
   `{ data: null, error: { code, message }, requestId }` on failure.
4. Authenticate first, authorize the exact resource second. Never rely on a
   hidden button or a client-supplied user/tenant ID as authorization.
5. Keep provider calls in server modules and expose small typed adapters to UI.

## Data

- Use primary/foreign keys, uniqueness, explicit nullability, check constraints,
  and indexes for ownership and query paths.
- Use migrations for schema changes. Make backfills safe for existing rows.
- Decide cascade, soft-delete, retention, and archival behavior explicitly.
- Use transactions for multi-write invariants and idempotency keys for retried
  mutations, payments, imports, and webhook processing.
- For multi-tenant data, store the tenant key and enforce it in every database
  query or with tested row-level security policies.

## HTTP and abuse resistance

- Set body and upload size limits before reading the entire payload.
- Allowlist MIME types and verify decoded content; never trust file extensions.
- Generate storage keys server-side and prevent path traversal.
- Use same-origin cookies with `HttpOnly`, `Secure`, and appropriate `SameSite`
  settings, or short-lived scoped bearer tokens.
- Configure an explicit CORS allowlist. Never combine wildcard origins with
  credentials.
- Add per-identity and per-IP rate limits to auth, password reset, search,
  uploads, AI, email/SMS, and expensive endpoints.
- Use bounded timeouts. Retry only safe transient failures with jitter.
- Verify webhook signatures against the raw body, reject stale timestamps, and
  persist provider event IDs to make delivery idempotent.

## Reliability and operations

- Add `/api/health` for liveness and a readiness check for required dependencies.
- Emit structured logs with request ID, route, status, duration, and safe error
  code. Do not log secrets, authorization headers, raw tokens, or private bodies.
- Handle `SIGTERM`: stop accepting work, finish bounded in-flight requests,
  close database connections, and exit.
- Move long-running work behind a durable job record/queue. Track attempt,
  status, next retry, last error, and deduplication key.
- Surface setup-required states precisely in the UI. Do not fake successful
  email, payment, upload, or background processing.

## Completion gate

- Test validation failures, unauthenticated access, cross-tenant access,
  duplicate/retried mutations, provider timeout/failure, and the success path.
- Run typecheck, unit/integration tests, and a production build.
- Confirm secrets are absent from client bundles and logs.
- Confirm persisted state survives a restart.
