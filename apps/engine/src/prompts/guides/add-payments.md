# Add payments and subscriptions safely

Use the provider's hosted checkout and customer portal unless the product
explicitly requires an embedded payment form. Never collect or store raw card
details in application code.

## Data model

Persist provider identifiers separately from product entitlements:

- customer: user/tenant ID, provider customer ID
- checkout/payment: provider session/payment ID, amount, currency, status,
  idempotency key
- subscription: provider subscription/price IDs, status, period end,
  cancel-at-period-end
- entitlement: feature/limit, owner, source, starts/ends
- webhook event: provider event ID, type, received/processed timestamps, result

Apply unique constraints to provider IDs and webhook event IDs.

## Server flow

1. Authenticate and authorize the purchaser.
2. Resolve product and price from a server-owned allowlist. Never accept an
   arbitrary price or amount from the browser.
3. Create/reuse the provider customer and create checkout with an idempotency
   key. Return only the hosted URL/client secret required by the provider.
4. Treat the redirect as presentation only. Grant access from a verified
   webhook, not a query string or client callback.
5. Verify the webhook signature against the raw request body, reject stale
   signatures, store the event ID, and process each event once.
6. Reconcile subscription state from the provider after out-of-order events.
7. Use the provider portal for card changes, invoices, cancellation, and
   subscription management when possible.

## Mobile

Digital goods consumed in iOS/Android apps normally require store billing.
Use RevenueCat or the platform StoreKit/Play Billing APIs and validate
entitlements server-side. Do not route digital-goods purchases around store
rules. Physical goods and services may use a web payment provider.

## Failure and security checks

- Handle abandoned checkout, payment failure, trial expiry, chargeback, refund,
  cancellation, grace period, and webhook replay.
- Display the final amount/currency and recurring interval before purchase.
- Require explicit confirmation for destructive cancellation or irreversible
  changes.
- Do not log webhook bodies, client secrets, or customer billing data.
- Test duplicate webhooks, forged signatures, cross-account portal access,
  retries, and stale subscription state.
