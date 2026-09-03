# Add email, SMS, and push communication

Choose one provider per channel and isolate it behind a typed server adapter.
Provider API keys and push credentials must remain server-side.

## Message model and delivery

Persist a provider-neutral message record with recipient owner, channel,
template/version, locale, status, idempotency key, scheduled/sent timestamps,
provider message ID, and a safe error code. Do not store secret tokens or full
sensitive payloads in logs.

1. Authenticate and authorize the action that triggers a message.
2. Render allowlisted, versioned templates on the server with escaped user data.
3. Enqueue delivery after the related database transaction commits.
4. Use idempotency keys so retries cannot send duplicates.
5. Apply per-user, per-tenant, and per-destination rate limits.
6. Verify provider webhooks before updating delivered, bounced, failed, opened,
   or unsubscribed state.

## Channel requirements

- Email: configure SPF, DKIM, DMARC, unsubscribe headers, bounce handling, and a
  plain-text alternative. Separate transactional and marketing consent.
- SMS: normalize E.164 numbers, obtain consent, support STOP/HELP flows, and
  avoid sensitive content.
- Push: request permission in context, register a token per device, rotate stale
  tokens, support topic/preferences and quiet hours, and avoid private payloads.
  Add iOS/Android native configuration and honest browser-preview fallbacks.

## Verification

Test duplicate jobs, provider timeout, invalid destination, bounce/unsubscribe,
revoked push token, quiet hours, locale fallback, cross-tenant access, webhook
forgery, and recovery after restart.
