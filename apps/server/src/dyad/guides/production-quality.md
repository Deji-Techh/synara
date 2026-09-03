# Production quality gate

Use this guide before calling a substantial feature or application complete.

## Automated baseline

- Unit-test pure logic and validation.
- Component-test important loading, empty, error, success, and permission states.
- Integration-test API/database/auth boundaries with deterministic fakes.
- Add Playwright coverage for the critical user journey and failure recovery.
- Run accessibility checks and keyboard interaction tests for key screens.
- Keep tests deterministic: no arbitrary sleeps, live billing, or production data.

## User experience

- Every visible control performs an action, navigates, persists, or explains
  precisely what setup is required.
- Provide labeled loading, empty, offline, error, retry, and success states.
- Preserve user input across recoverable failures and guard unsaved changes.
- Use semantic HTML, visible focus, logical heading order, accessible names,
  44px touch targets, reduced motion, sufficient contrast, and live regions for
  async results.
- Verify 320×568, 390×844, 844×390, 768×1024, and 1024×768. No clipped controls,
  page-level horizontal scrolling, overlapping content, or phone-width layouts
  floating in tablet space.

## Web and mobile delivery

- Provide title, description, canonical/social metadata, icons, manifest, and a
  useful not-found state for public web apps.
- Lazy-load route-level code and non-critical media; reserve media dimensions.
- Define performance budgets for initial JavaScript, largest image, and the
  critical interaction. Measure a production build, not only dev mode.
- Detect offline state and make destructive/financial mutations explicit about
  whether they are queued, failed, or completed.
- Verify platform IDs, display names, icons, versions, deep links, permissions,
  and signing configuration before a native release.

## Operations

- Add safe structured error reporting, health signals, and support diagnostics.
- Document required environment variables and fail fast when they are missing.
- Provide migrations, rollback/recovery notes, and backup/restore ownership for
  persistent data.
- Run lint, strict typecheck, tests, and production build. Fix failures rather
  than suppressing them.
