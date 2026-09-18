// FILE: githubOAuth.ts
// Purpose: GitHub device-flow OAuth (PAT alternative for repo create/push/
// invite without pasting tokens).
// Donor: dyad x caide src/ipc/handlers/github_handlers.ts device flow
// (endpoints, scopes, polling semantics) — Electron IPC replaced with
// return values; token persists in the encrypted provider secrets store
// under "github" (same reader as PAT: getGithubToken).
//
// OAuth app: CAIDE_GITHUB_CLIENT_ID overrides; defaults to the donor app id
// (works today — replace with a Caide-owned OAuth app later; same pattern
// as the hosted broker decision in 007 §3). Test builds can point all three
// bases at a loopback fake via CAIDE_GITHUB_TEST_SERVER_BASE.

import { sharedProviderSecrets } from "../providers/secrets.ts";

const GITHUB_SCOPES = "repo,user,workflow";

function clientId(): string {
  return process.env.CAIDE_GITHUB_CLIENT_ID?.trim() || "Ov23liWV2HdC0RBLecWx";
}

function testBase(): string {
  return (process.env.CAIDE_GITHUB_TEST_SERVER_BASE ?? "").replace(/\/$/, "");
}

function deviceCodeUrl(): string {
  const base = testBase();
  return base ? `${base}/github/login/device/code` : "https://github.com/login/device/code";
}

function accessTokenUrl(): string {
  const base = testBase();
  return base
    ? `${base}/github/login/oauth/access_token`
    : "https://github.com/login/oauth/access_token";
}

export class GithubOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubOAuthError";
  }
}

export interface GithubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
  const data = (await res.json().catch(() => null)) as {
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok) {
    throw new GithubOAuthError(`GitHub API Error: ${data?.error_description || res.statusText}`);
  }
  return data;
}

/** Donor device-code request parity (repo/user/workflow scopes). */
export async function requestGithubDeviceCode(signal?: AbortSignal): Promise<GithubDeviceCode> {
  const data = (await postJson(
    deviceCodeUrl(),
    { client_id: clientId(), scope: GITHUB_SCOPES },
    signal,
  )) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in?: number;
    interval?: number;
  };
  if (!data?.device_code || !data?.user_code || !data?.verification_uri) {
    throw new GithubOAuthError("GitHub device flow returned an incomplete challenge.");
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in ?? 900,
    interval: data.interval ?? 5,
  };
}

export interface GithubPollResult {
  accessToken: string;
}

/**
 * Donor pollForAccessToken parity: polls until authorized, honoring
 * authorization_pending (keep waiting), slow_down (back off +5s),
 * access_denied/expired_token (fail fast), and the device-code expiry.
 * onPending lets the UI re-render the countdown; shouldStop aborts.
 */
export async function pollGithubAccessToken(
  deviceCode: string,
  opts?: {
    interval?: number;
    expiresIn?: number;
    signal?: AbortSignal;
    shouldStop?: () => boolean;
    onPending?: (elapsedSeconds: number) => void;
  },
): Promise<GithubPollResult> {
  let interval = Math.max(1, opts?.interval ?? 5);
  const deadline = Date.now() + (opts?.expiresIn ?? 900) * 1000;
  const started = Date.now();
  for (;;) {
    if (opts?.shouldStop?.()) throw new GithubOAuthError("GitHub connection cancelled.");
    opts?.signal?.throwIfAborted();
    if (Date.now() >= deadline) {
      throw new GithubOAuthError("GitHub device code expired — restart the connection.");
    }
    const data = (await postJson(
      accessTokenUrl(),
      {
        client_id: clientId(),
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      opts?.signal,
    )) as { access_token?: string; error?: string; error_description?: string };
    if (data?.access_token) return { accessToken: data.access_token };
    if (data?.error === "authorization_pending") {
      opts?.onPending?.(Math.floor((Date.now() - started) / 1000));
    } else if (data?.error === "slow_down") {
      interval += 5;
    } else if (data?.error === "access_denied") {
      throw new GithubOAuthError("GitHub authorization was denied in the browser.");
    } else if (data?.error === "expired_token") {
      throw new GithubOAuthError("GitHub device code expired — restart the connection.");
    } else if (data?.error) {
      throw new GithubOAuthError(
        `GitHub authorization failed: ${data.error_description || data.error}`,
      );
    } else {
      throw new GithubOAuthError("GitHub authorization returned an unexpected response.");
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, interval * 1000);
      opts?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(opts.signal?.reason ?? new Error("aborted"));
        },
        { once: true },
      );
    });
  }
}

/** Persist the OAuth token where getGithubToken reads (encrypted at rest). */
export function saveGithubOAuthToken(accessToken: string): void {
  if (!accessToken.trim()) throw new GithubOAuthError("Refusing to save an empty GitHub token.");
  sharedProviderSecrets().setProvider("github", { apiKey: accessToken.trim() });
}

/** Disconnect device-flow auth (PAT/env fallbacks keep working). */
export function disconnectGithubOAuth(): void {
  sharedProviderSecrets().setProvider("github", { apiKey: "" });
}
