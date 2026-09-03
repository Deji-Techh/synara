// FILE: testGuidance.ts
// Purpose: Shared Playwright e2e test-writing guidance. The body is shared
// across surfaces so they all produce the same kind of test; only the
// instruction for HOW to emit the spec file differs.
// Donor: dyad x caide src/prompts/system_prompt.ts buildTestWritingGuidance +
// TEST_WRITING_GUIDANCE + AGENT_TEST_WRITING_GUIDANCE (verbatim, extracted
// here so systemPrompt.ts and agentPrompt.ts share without a require cycle).

const buildTestWritingGuidance = (emitInstruction: string) =>
  `# Writing end-to-end tests

When the user asks you to write an end-to-end (e2e) test for a feature or flow, write a Playwright test.

- FIRST, explore the codebase before writing any test. Read the relevant routes, pages, and components for the flow under test so your test reflects how the app ACTUALLY behaves — the real URLs/paths, the actual labels, roles, and placeholder text of the elements you'll target, the form fields and their validation, and any auth or data requirements. Do NOT guess selectors or invent UI that doesn't exist; base every locator and assertion on what you find in the code.
- Write the spec file under the app's \`tests/\` folder, named after the flow (e.g. \`tests/signup.spec.ts\`).
${emitInstruction}
- Make sure \`@playwright/test\` is installed as a dev dependency. If it isn't already in \`package.json\`, install it (Playwright is required to run the test).
- Import from \`@playwright/test\`: \`import { test, expect } from "@playwright/test";\`.
- Navigate with \`await page.goto("/")\` — the base URL is configured automatically, so use app-relative paths.
- Prefer role- and text-based locators (\`page.getByRole\`, \`page.getByText\`, \`page.getByLabel\`, \`page.getByPlaceholder\`) over CSS/XPath selectors. They are far more robust.
- Playwright matches accessible names by substring unless told otherwise. For short, symbolic, or overlapping names (for example \`+\` beside \`M+\`, \`-\` beside \`M-\`, or \`Save\` beside \`Save draft\`), ALWAYS use an exact accessible-name match such as \`page.getByRole("button", { name: "+", exact: true })\`. Before clicking, make sure the locator identifies one element; never leave a strict-mode ambiguity in a generated test.
- Rely on \`await expect(locator).toBeVisible()\` / \`toHaveText()\` etc. — these auto-wait, so you do NOT need manual sleeps or \`waitForTimeout\`.
- When a UI element is hard to target reliably, add a \`data-testid\` attribute to the component you build and select it with \`page.getByTestId("...")\`. It's fine to edit the app's components to add \`data-testid\`s for this purpose.
- Keep each test focused on one happy-path user flow. Write tests that the app is expected to PASS.
- These tests are a starting point for the user to review and re-run — keep them simple and readable.

## Debugging a failing test

When a test is failing and you're asked to fix it, do NOT guess at the cause from the error message alone. Playwright writes concrete failure evidence to a \`test-results/<test-name>/\` folder on every failure — READ it FIRST, before changing anything:
- \`error-context.md\` — an accessibility-tree snapshot of the page at the moment of failure. This is the most useful artifact: it shows what was ACTUALLY on the page (the roles, labels, and text that were present), which tells you whether your locator was wrong or the app never rendered what the test expected.
- \`test-failed-1.png\` — a screenshot of the page at the point of failure. Look at it to see the real UI state (an error page, a loading spinner, an empty list, a modal covering the target, etc.).

The error message and test output usually reference these paths directly — open them. Use what you find to decide whether the TEST's expectation is wrong (fix the locator/assertion) or the APP is broken (fix the app), then fix the real cause instead of tweaking selectors blindly.

## Isolated test data (database-connected apps)

For CAIDE-managed Neon and Supabase apps, CAIDE isolates each test session so tests can create, update, and delete data without touching the user's real data. Depending on the provider this is either a temporary, throwaway COPY of the database, or a dedicated, pre-provisioned TEST USER whose data is scoped by Row-Level Security. You do NOT need to write any setup/teardown code; CAIDE handles the isolation around the run.

Custom databases, custom backends, and providers CAIDE cannot manage may NOT be isolated. If the Tests panel warns that isolation is unavailable, assume the test can touch the app's current data: keep setup minimal, avoid destructive flows unless the user explicitly asks for them, and prefer creating disposable records through the app itself.

Because the isolated session starts effectively empty (a fresh copy, or a brand-new user that owns no rows yet), do NOT assume specific rows exist. Instead, set up the data each test needs as part of the test (fixtures), then assert against it.

### Fixtures: seeding the data a test needs

- Put reusable setup in files under \`tests/fixtures/\` (e.g. \`tests/fixtures/todos.ts\`) and import them into your specs. Write fixtures as plain files so the user can review and edit them — never hide setup in a way that regenerates differently each run.
- Seed data THROUGH THE APP (its UI or its API routes), the same way a user would — e.g. create a todo by filling the app's "new todo" form, or POSTing to the app's own API route. This guarantees the data is written within the isolated session (the throwaway copy, or owned by the isolated test user so Row-Level Security scopes it correctly).
- Do NOT seed by connecting to the database directly from the test, and do NOT run SQL/migrations against the database while authoring the test — that would write to the user's REAL data, outside the isolated session.
- Base the fixture data on the app's actual schema and on what the specific test needs. Keep it minimal: seed only what the test asserts on.

### Authenticated tests (signing in a test user)

This section applies ONLY when the specific flow under test genuinely requires a logged-in user. If the flow is reachable without signing in, or the user asked for a test that doesn't need authentication (or explicitly doesn't want auth), skip everything below — test the reachable flow as it is and do NOT add any login/signup UI. Note that \`process.env.DYAD_TEST_USER_*\` being set means CAIDE provisioned a test user for the session; it does NOT mean this particular test needs a login. If a flow truly can't be tested without a sign-in that the app doesn't have yet, say so and ask the user before building auth — don't add it silently.

When a flow requires a logged-in user, use the built-in auth fixture in \`tests/fixtures/test-user.ts\` instead of hand-rolling credentials. Expose a \`signIn(page)\` helper (and \`signUp\` where relevant) from there and import it into your specs.
- If \`process.env.DYAD_TEST_USER_EMAIL\` and \`process.env.DYAD_TEST_USER_PASSWORD\` are set, CAIDE has ALREADY provisioned an isolated test user — read the credentials from those env vars and sign that user in by driving the app's OWN login UI. Do NOT sign them up; they already exist. If the flow needs a login and the app has no login UI yet, build one before writing the auth-gated test.
- Otherwise, define a shared test user and create it by driving the app's OWN signup flow (so the user can really authenticate). If the flow needs a login and the app has no signup flow yet, build one (or an equivalent way to create a user) first. Say so clearly if you add it.
- Never INSERT users directly into auth tables; that commonly produces a user that exists but cannot log in.`;

/** Build-mode test-writing guidance: emit the spec via a `<dyad-generate-test>` tag. */
export const TEST_WRITING_GUIDANCE = buildTestWritingGuidance(
  `- In Build mode, emit it with a \`<dyad-generate-test>\` tag (NOT \`<dyad-write>\`) so it shows up in the Tests panel:
  <dyad-generate-test path="tests/signup.spec.ts" description="Tests the signup flow">
  ...test code...
  </dyad-generate-test>`,
);

/**
 * Local-agent test-writing guidance: write the spec with the `write_file` tool.
 * CAIDE detects `.spec.ts` files and surfaces them in the Tests panel where the
 * user can run them — there is no dedicated test tool.
 */
export const AGENT_TEST_WRITING_GUIDANCE = buildTestWritingGuidance(
  `- Write it with the \`write_file\` tool to a path ending in \`.spec.ts\` under \`tests/\` (e.g. \`tests/signup.spec.ts\`). CAIDE detects \`.spec.ts\` spec files and surfaces them in the Tests panel where the user can run them.`,
);
