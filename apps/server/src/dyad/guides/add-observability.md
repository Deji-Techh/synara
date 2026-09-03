# Add analytics, error tracking, and operational observability

Collect the smallest useful data set. Define an event contract before adding an
SDK, and keep analytics separate from authorization or billing truth.

## Instrumentation contract

- Use stable event names and typed properties.
- Attach release/version, environment, route/operation, request or trace ID,
  and coarse device context.
- Identify users only after consent and authentication. Use an internal opaque
  ID rather than email, phone, token, prompt content, or another secret.
- Scrub authorization headers, cookies, credentials, URLs with tokens, form
  values, private files, and provider payloads before logs or error reports.
- Respect opt-out, retention, deletion, and regional consent requirements.

## Reliability signals

Add structured server logs, exception reporting, request latency/error rates,
job and webhook outcomes, database health, and external-provider status. Set
timeouts around telemetry so it can never block the product path.

For client performance, capture Web Vitals or native startup/navigation timing
with sampling. Use session replay only with explicit product approval, input
masking, and privacy review.

## Verification

Test development and production configuration separately. Trigger a safe test
error and event, verify release/source-map attribution, confirm secrets and
personal fields are scrubbed, exercise opt-out/deletion, and confirm the app
still works when the telemetry provider is blocked or unavailable.
