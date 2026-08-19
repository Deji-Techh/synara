# Add realtime features and background jobs

Use the connected backend's managed realtime and job facilities before adding a
new server. Realtime delivery is an optimization; persisted state remains the
source of truth.

## Realtime

1. Authenticate the socket/channel and authorize each topic, tenant, room, and
   resource server-side.
2. Use versioned event envelopes with event ID, type, resource ID, version, and
   timestamp. Validate every inbound event.
3. Reconcile from an API/database snapshot after connect or reconnect. Never
   assume every event arrives once or in order.
4. Debounce ephemeral signals such as typing/cursors and expire presence with a
   heartbeat timeout.
5. Remove subscriptions on route change/logout and bound reconnect backoff.

## Background jobs

Persist jobs with a stable idempotency key, status, attempt count, next attempt,
lease/lock expiry, and sanitized error. Enqueue only after the source
transaction commits.

- Make handlers safe for at-least-once execution.
- Use bounded exponential backoff with jitter and a terminal dead-letter state.
- Renew or expire leases so crashed workers do not strand jobs.
- Apply concurrency and rate limits per provider/tenant.
- Expose user-visible status and retry only when retry is safe.

## Verification

Test unauthorized subscriptions, reconnect and missed-event reconciliation,
duplicate/out-of-order events, offline recovery, process crash during a job,
duplicate delivery, poison jobs, provider rate limiting, and graceful shutdown.
