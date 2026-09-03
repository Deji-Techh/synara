# Production Authentication and Authorization

Use this guide for account, session, permission, organization, and identity
features. Prefer the connected Supabase or Neon Auth integration. Do not build
an authentication protocol or cryptographic primitive from scratch.

## Choose the supported flow

- Email/password: use the provider SDK and its hosted password recovery flow.
- Social sign-in: read `add-social-auth` as well. For mobile builds, use PKCE
  and an allow-listed app deep-link callback.
- Magic link or email OTP: use the provider's passwordless API, expire codes,
  prevent replay, and show a neutral response whether an account exists or not.
- Phone/SMS OTP: normalize to E.164, rate-limit sends and attempts, expire and
  consume codes once, and require explicit consent for messaging.
- Passkeys/WebAuthn: use a maintained server library or provider feature. Verify
  origin, RP ID, challenge, counter, user verification, and attestation policy.
- Enterprise SSO: use provider SAML/OIDC support with an allow-listed tenant or
  domain. Never accept an arbitrary issuer or redirect URL from the client.
- MFA: prefer TOTP or WebAuthn. Require a fresh session before enrollment,
  display recovery codes once, hash recovery codes, and support revocation.

## Data model

Keep provider-owned identities separate from application authorization.

Minimum application tables:

- `profiles`: one row per auth user, containing display-safe profile fields.
- `organizations` or `workspaces`: tenant identity and lifecycle state.
- `memberships`: `(organization_id, user_id, role, status)` with a unique pair.
- `permissions` or a documented role-to-capability mapping when roles alone are
  insufficient.
- `auth_audit_events`: actor, target, action, outcome, IP/user-agent summary,
  request ID, timestamp, and non-sensitive metadata.
- `trusted_devices` only when the product genuinely needs remembered devices;
  store a hash of the device credential, not a raw reusable token.
- `personal_access_tokens` only when required; store a prefix and a strong hash,
  scopes, last-used time, expiry, and revocation time.

Use foreign keys, uniqueness, explicit cascade behavior, and indexes for every
membership and authorization lookup.

## Authorization contract

- Authenticate the request at the trusted server/database boundary.
- Derive the user ID from the verified session, never from a client field.
- Check tenant membership, role, ownership, and resource state for every read
  and mutation. Hiding a button is not authorization.
- With Supabase, enable RLS on exposed tables and write policies for select,
  insert, update, and delete. Test policies with two tenants and an anonymous
  client.
- Keep service-role credentials server-side. Never use them in generated
  browser or mobile code.
- Prefer capability checks such as `canInviteMembers` over scattered string
  comparisons. Default to deny.
- For admin impersonation, require a privileged server action, a short expiry,
  a visible banner, an immutable audit event, and an immediate exit action.

## Account and identity lifecycle

- Fetch avatar/name from the verified provider identity, copy only allow-listed
  fields into `profiles`, and let the user correct them.
- Account linking must require a fresh authenticated session and provider proof.
  Prevent linking an identity already owned by another account.
- Profile metadata is not permission data. Store roles/permissions in protected
  tables or verified custom claims updated only by trusted code.
- List active sessions when the provider supports it; allow revoking other
  sessions and rotating the current refresh token after sensitive changes.
- Account deletion must require recent authentication, cancel or transfer owned
  resources deliberately, revoke sessions/tokens, schedule provider cleanup,
  and preserve only legally required audit records.
- Data export must be authenticated, asynchronous for large datasets, encrypted
  in transit, short-lived, and audit logged.

## Abuse and session safety

- Apply per-IP and per-account limits to sign-up, login, password reset, OTP,
  account linking, and token creation. Add CAPTCHA only where abuse warrants it.
- Use secure, HttpOnly, SameSite cookies for web sessions where supported.
  Mobile tokens belong in platform secure storage, never localStorage.
- Use short-lived access tokens and provider-managed refresh rotation. Detect
  refresh-token reuse where supported and revoke the token family.
- Require recent authentication for password, email, MFA, payout, deletion,
  role, and token changes.
- Return neutral authentication errors and never reveal whether an account
  exists. Do not log passwords, OTPs, cookies, access/refresh tokens, recovery
  codes, authorization headers, or raw OAuth responses.

## Mobile callback contract

- Register a unique HTTPS Universal Link/App Link when possible, with a custom
  scheme only as a controlled fallback.
- Allow-list exact callback URLs in the auth provider and app configuration.
- Validate OAuth `state`; use PKCE; complete the session once; clear pending
  state on success, cancellation, expiry, or mismatch.
- Handle cold start, warm start, cancellation, browser dismissal, offline
  return, and an already-linked identity.

## Required UI states

Provide loading, disabled, success, cancellation, retry, offline, expired-code,
rate-limited, and provider-unavailable states. Keep focus and screen-reader
announcements correct. Never strand the user inside an in-app browser.

For settings/admin experiences include:

- connected identities with link/unlink controls,
- MFA enrollment and recovery-code regeneration,
- active sessions/devices with revoke controls,
- role/member management guarded by capability,
- account export and deletion with explicit confirmation.

## Verification

Test valid and invalid callbacks, replayed/expired OTPs, account linking
conflicts, refresh rotation, session revocation, tenant isolation, role changes,
anonymous access, deletion cleanup, and rate limits. Verify privileged keys and
tokens never enter client bundles, generated source, logs, screenshots, or
analytics.

