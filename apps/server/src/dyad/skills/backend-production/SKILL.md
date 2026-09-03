---
name: backend-production
description: Apply whenever an app uses persistence, authentication, APIs, storage, realtime, payments, or privileged operations. Enforces production backend architecture, security, observability, migrations, and failure handling.
---

# Backend Production Contract

## Required guide routing

When the `read_guide` tool is available, load the matching guide before
implementing:

- Creating a new app that needs a database, auth, or server-side logic:
  `provision-backend`
- APIs, privileged integrations, webhooks, or persistence:
  `build-secure-backend`
- object storage, uploads, images, video, or private downloads:
  `add-storage-media`
- email, SMS, transactional messages, or push delivery:
  `add-communications`
- realtime, presence, subscriptions, queues, schedules, or background jobs:
  `add-realtime-jobs`
- analytics, error tracking, performance monitoring, logs, or tracing:
  `add-observability`
- checkout, billing, subscriptions, in-app purchases, or entitlements:
  `add-payments`
- camera, location, notifications, biometrics, deep links, share, sensors, or
  another device API: `add-native-capability`
- final testing, accessibility, performance, release, or operational readiness:
  `production-quality`

- Authentication/account/session work: `add-authentication`
- Social OAuth, provider login, callbacks, or account linking:
  `add-authentication`, then `add-social-auth`
- Passwordless, phone, passkeys, MFA, RBAC/RLS, sessions, account lifecycle,
  admin identity controls, or enterprise SSO: `production-auth-authorization`
- Public APIs, multi-tenancy, admin operations, imports/exports, backups,
  caching, integration OAuth/webhooks, or production runtime readiness:
  `production-platform`

## Architecture

- Keep secrets and privileged credentials server-side. The client receives only publishable configuration.
- Define typed boundaries for requests, responses, errors, events, and persisted records.
- Separate authorization from UI visibility. Enforce ownership, role, and tenant boundaries at the database/API layer.
- Use established provider SDKs and the project's existing backend patterns before adding infrastructure.

## Data and migrations

- Use explicit primary keys, foreign keys, nullability, uniqueness, and check constraints.
- Add indexes for actual query and authorization paths.
- Make migrations repeatable, ordered, and safe for existing data. Include seed data only when it is deterministic and non-sensitive.
- Define deletion, archival, retention, and cascading behavior deliberately.

## Security

- Validate and normalize all external input at the boundary.
- Prevent injection, XSS, CSRF, SSRF, insecure direct object references, path traversal, and unrestricted upload behavior.
- Hash credentials with a proven password library; never implement cryptography manually.
- Apply least privilege, row-level security where supported, rate limits on abuse-prone endpoints, and short-lived scoped tokens.
- Never log secrets, authorization headers, private user content, or raw provider responses containing credentials.

## Reliability and operations

- Set request timeouts and bounded retries only for safe transient operations.
- Make retried mutations idempotent or attach idempotency keys.
- Return stable user-safe errors while preserving actionable diagnostic context in local logs.
- Add health signals and structured logs for important jobs and external calls.
- Handle partial failure, reconnect, concurrency, duplicate events, and provider unavailability.

## Completion gate

Run schema/type/build checks and the relevant integration path. Verify unauthorized access fails, valid access succeeds, secrets stay server-side, errors recover cleanly, and persistence survives refresh/restart.
