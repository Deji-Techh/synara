# Production Backend Platform

Use this guide when an app needs a durable API, multi-tenant data, admin
operations, integrations, imports/exports, caching, or production deployment.
Read `build-secure-backend` first for the baseline trust-boundary contract.

## API contract

- Define typed request, response, event, and error schemas.
- Validate path, query, headers, and body at the trusted boundary. Reject
  unknown or oversized input deliberately.
- Use stable error codes and safe messages. Attach a request ID and keep private
  diagnostic context in structured logs.
- Use cursor pagination for changing datasets; define deterministic sorting and
  a maximum page size. Allow-list filter and sort fields.
- Version breaking public contracts. Prefer additive changes and a documented
  deprecation window.
- Generate OpenAPI for public REST endpoints and verify examples against the
  runtime schemas.
- Configure an exact CORS allow-list. Never combine credentials with `*`.
- Apply CSP, HSTS, frame protection, MIME sniffing protection, and a deliberate
  referrer/permissions policy at the serving boundary.

## Runtime readiness

- Expose separate liveness and readiness checks. Readiness must fail when a
  required database or queue dependency cannot safely serve traffic.
- On shutdown, stop accepting work, drain requests, release job leases and
  database connections, flush bounded telemetry, then exit before the platform
  deadline.
- Put deadlines on external calls. Retry only safe transient failures with
  jitter and a cap. Use circuit breaking where provider failure would otherwise
  cascade.
- Emit structured logs, metrics, and traces with request/job IDs. Scrub secrets
  and personal data.

## Multi-tenant architecture

- Model tenants/workspaces and memberships explicitly. Put `tenant_id` on every
  tenant-owned record and index it with common query keys.
- Derive tenant and user identity from the verified session and membership, not
  client-supplied claims.
- Enforce tenant isolation in database RLS or every trusted repository query.
  Test two tenants for reads, writes, joins, search, exports, storage paths, and
  realtime channels.
- Invitations require a single-use expiring token, intended email/tenant, role
  ceiling, revocation, and an audit event.
- Domain mapping and white-label configuration must verify ownership and keep
  secrets separate per tenant.

## Data operations

- Use ordered migrations with backward-compatible expand/migrate/contract
  steps for live systems.
- Seed only deterministic, non-sensitive development/demo data.
- For CSV/JSON import, stage the file, validate each row, report row-level
  errors, make retries idempotent, and commit in bounded batches.
- For export, authorize the full query, stream or queue large output, encrypt
  transport, use a short-lived signed download, and audit access.
- Use PostgreSQL full-text search with maintained `tsvector` columns and GIN
  indexes before adding a search service. Preserve tenant filters in every
  search path.
- Use provider-managed backups and point-in-time recovery; document retention
  and run restore drills. A backup that has never been restored is unverified.
- Use the provider pooler for serverless workloads. Bound pool size and timeouts.
- Add Redis only for a measured cache, lock, rate-limit, or pub/sub requirement.
  Define TTL, invalidation, stampede protection, and degraded behavior.

## Integrations and webhooks

- Store provider secrets in the deployment secret store, scoped by environment
  and tenant where required. Support rotation without source changes.
- Incoming webhooks require signature verification over the raw body,
  timestamp/replay protection, idempotency, durable processing, and safe
  acknowledgement.
- Outgoing webhooks use per-endpoint signing secrets, an event ID, timestamp,
  bounded retries, delivery history, disablement after persistent failure, and
  manual replay.
- OAuth integrations require exact redirect allow-lists, PKCE/state where
  applicable, encrypted server-side token storage, least scopes, refresh
  handling, disconnect/revoke, and explicit failure UI.

## Admin and compliance operations

- Admin tools use the same typed API and stricter authorization, never direct
  client access with a service credential.
- Record immutable actor/action/target/outcome audit events for role, billing,
  export, deletion, integration, and security changes.
- Define retention and deletion schedules per data class. Implement access,
  correction, export, and erasure workflows before claiming GDPR/CCPA support.
- Keep environment separation explicit: different projects, credentials,
  callback URLs, signing secrets, and observability tags for development,
  staging, and production.

## Verification

Run schema, type, unit, integration, and production build checks. Test tenant
isolation, pagination consistency, malformed/oversized input, CORS preflight,
security headers, webhook replay, secret rotation, shutdown, dependency
failure, backup restoration, export authorization, and an integration
disconnect/reconnect path.

