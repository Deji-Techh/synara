# Add a Capacitor native capability

Use this guide for camera, photos, location, notifications, biometrics,
clipboard, contacts, calendar, share, deep links, haptics, sensors, audio,
background work, or another device API.

## Implementation

1. Prefer an official Capacitor plugin. Check compatibility with the installed
   Capacitor major version before adding it.
2. Put plugin access behind a typed adapter. Detect the platform and provide an
   honest browser-preview fallback or a clear “requires device build” state.
3. Request permission immediately before the feature needs it, after explaining
   why. Handle denied, restricted, provisional, unavailable, and revoked states.
4. Add the required iOS usage descriptions/entitlements and Android manifest
   permissions/features. Use the least privilege and scope possible.
5. Subscribe to native listeners once and remove them on unmount/logout.
6. Treat deep-link, push, share-extension, and intent payloads as untrusted
   external input. Validate route and resource identifiers before navigation.

## Privacy and lifecycle

- Minimize collection, precision, retention, and background access.
- Keep sensitive data out of logs and client analytics.
- Account for pause/resume, background/foreground, process death, offline mode,
  orientation, keyboard, safe-area insets, and repeated permission prompts.
- For push notifications, register tokens server-side per device, rotate stale
  tokens, support preference/quiet-hour controls, and never place secrets or
  unnecessary personal data in payloads.
- For media uploads, validate size/type twice: before upload for UX and on the
  server for security.

## Verification

Verify browser preview, iOS, and Android separately. Test first run, granted,
denied, revoked, offline, background/resume, and unavailable-device behavior.
Run the native sync/build step after configuration changes.
