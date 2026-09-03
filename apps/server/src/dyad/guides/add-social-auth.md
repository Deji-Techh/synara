# Add social sign-in

Use this after the base authentication guide when the user wants Google, Apple,
GitHub, Discord, X/Twitter, Microsoft, Facebook, LinkedIn, or enterprise SSO.

## Provider setup

- Use the connected provider's auth service. Do not implement OAuth token
  exchange in browser code.
- In CAIDE, open the project's database integration and configure Social
  sign-in. Copy the exact callback URL shown there into the external provider's
  developer console.
- Keep OAuth client secrets in Supabase/Neon provider configuration only. Never
  put them in `VITE_*`, `NEXT_PUBLIC_*`, source files, or client bundles.
- Register production, preview, localhost, and native deep-link return URLs
  explicitly. Use an allowlist rather than wildcard redirects where possible.

## Supabase client flow

Use the existing Supabase browser client:

```ts
type SocialProvider =
  | "google"
  | "apple"
  | "github"
  | "discord"
  | "twitter"
  | "facebook"
  | "azure"
  | "linkedin_oidc";

export async function signInWithSocialProvider(provider: SocialProvider) {
  const redirectTo = new URL("/auth/callback", window.location.origin).href;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) throw error;
  return data;
}
```

Create a callback route that shows progress, waits for session initialization,
handles provider-denied/error query parameters, and then redirects to the
original safe in-app destination. Never redirect to an arbitrary URL supplied
by the query string.

For Capacitor builds, use the App Identity deep-link scheme, open the provider
URL in the system auth browser, validate the returned scheme/host/path, exchange
the returned session through the official SDK, and remove native listeners
after completion.

## Neon Auth

Configure Google, GitHub, or Microsoft in Neon Auth. Prefer
`NeonAuthUIProvider` and `AuthView` so enabled providers appear consistently.
If the application needs custom buttons, use the installed Neon Auth client/UI
SDK for the configured provider; do not hand-roll the authorization URL or
token exchange.

## Account and authorization behavior

- After sign-in, create application profile data idempotently using the stable
  auth user ID. Do not use email as the primary identity key.
- Decide whether identities with the same verified email may link. Never merge
  accounts silently.
- Preserve the requested destination across the round trip, but allow only
  internal routes.
- Handle cancelled consent, popup/browser close, provider outage, missing email,
  unverified email, disabled account, duplicate identity, and revoked access.
- Request the minimum scopes. Ask for provider API scopes only when a product
  feature genuinely needs them.
- Authorization remains server/RLS-enforced after social login; provider login
  is identity proof, not an admin role.

## Completion gate

Test new login, returning login, logout, refresh/restart persistence, denied
consent, callback error, cross-account access rejection, account linking
policy, and the production redirect URL. Verify client secrets do not appear in
the project files, client bundle, logs, or generated error messages.
