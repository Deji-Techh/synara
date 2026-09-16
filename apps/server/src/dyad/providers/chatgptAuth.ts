// FILE: chatgptAuth.ts
// Purpose: ChatGPT account auth (OAuth device flow) + Codex session client.
// Donor: dyad x caide src/main/chatgpt_auth.ts (device flow, token storage,
// refresh, JWT identity, codex fetch wrapper, model discovery — verbatim
// behavior) + src/ipc/handlers/chatgpt_handlers.ts (login state machine:
// single-flight poll, interval throttle, expiry, single-use code clearing).
// Adaptations (no Electron): token storage lives in the encrypted provider
// secrets file under the `chatgpt` entry (never the keychain); the browser
// is opened by the UI from the returned verificationUrl (no shell here);
// logging is console. The AI-SDK session client (createChatGPTModel) is
// dropped — turns use the session access token through routing + the harness
// streaming adapter, same wire protocol.

import { defaultSecretsPath, isEncryptedSecretsFile, sharedProviderSecrets } from "./secrets.ts";

export const CHATGPT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_SCOPE = "openid profile email offline_access";
export const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
export const CHATGPT_CLIENT_VERSION = "0.142.5";
const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;
const AUTH_CLAIM = "https://api.openai.com/auth";

export interface ChatGPTTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  expiresAt?: number;
}

export interface ChatGPTUser {
  accountId: string;
  email?: string;
  name?: string;
  plan?: string;
}

export interface ChatGPTDeviceCode {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
}

export type ChatGPTDevicePollResult =
  | { status: "pending" }
  | {
      status: "authorized";
      authorizationCode: string;
      codeVerifier: string;
    };

export type ChatGPTStatus =
  | { status: "unauthenticated" }
  | {
      status: "pending";
      userCode: string;
      verificationUrl: string;
      interval: number;
      expiresAt: number;
    }
  | { status: "expired"; message: string; user?: ChatGPTUser }
  | { status: "authenticated"; user: ChatGPTUser }
  | { status: "error"; message: string; user?: ChatGPTUser };

// --- token storage (encrypted provider secrets, `chatgpt` entry) ---

export function readChatGPTSession(): ChatGPTTokens | undefined {
  try {
    const entry = sharedProviderSecrets().read().providers.chatgpt;
    const session = entry?.session;
    if (!session || typeof session !== "object") return undefined;
    const tokens = session as ChatGPTTokens;
    return tokens.accessToken ? tokens : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist the session. Donor parity: V1 refuses to connect without OS
 * secure storage; here the encrypted secrets envelope is the equivalent —
 * when key storage is unavailable the file falls back to plaintext, so
 * refuse instead of persisting OAuth credentials in the clear.
 */
export function writeChatGPTSession(tokens: ChatGPTTokens): void {
  sharedProviderSecrets().setProvider("chatgpt", { session: tokens });
  if (!isEncryptedSecretsFile(defaultSecretsPath())) {
    sharedProviderSecrets().clearProviderSession("chatgpt");
    throw new Error("ChatGPT cannot be connected because secure local storage is unavailable.");
  }
}

export function clearChatGPTSession(): void {
  try {
    sharedProviderSecrets().clearProviderSession("chatgpt");
  } catch {
    // logout best-effort
  }
}

export function hasChatGPTSession(): boolean {
  return readChatGPTSession() !== undefined;
}

// --- JWT identity (verbatim donor) ---

function decodeJwt(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveAccountId(token: string | undefined): string | undefined {
  const auth = decodeJwt(token)?.[AUTH_CLAIM];
  return isRecord(auth) && typeof auth.chatgpt_account_id === "string"
    ? auth.chatgpt_account_id
    : undefined;
}

function tokenExpiry(token: string | undefined): number | undefined {
  const expiry = decodeJwt(token)?.exp;
  return typeof expiry === "number" ? expiry * 1000 : undefined;
}

export function getChatGPTUser(tokens = readChatGPTSession()): ChatGPTUser | undefined {
  if (!tokens) return undefined;
  const claims = decodeJwt(tokens.idToken) ?? {};
  const auth = isRecord(claims[AUTH_CLAIM]) ? claims[AUTH_CLAIM] : {};
  const accountId =
    tokens.accountId ?? deriveAccountId(tokens.idToken) ?? deriveAccountId(tokens.accessToken);
  if (!accountId) return undefined;
  return {
    accountId,
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    plan: typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined,
  };
}

// --- device flow (verbatim donor HTTP) ---

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function requestChatGPTDeviceCode(): Promise<ChatGPTDeviceCode> {
  const response = await fetch(`${CHATGPT_ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID }),
  });
  if (!response.ok) {
    throw new Error(
      `ChatGPT device login could not start (${response.status}): ${await safeText(response)}`,
    );
  }
  const raw = (await response.json()) as {
    device_auth_id?: string;
    user_code?: string;
    usercode?: string;
    interval?: number | string;
  };
  const userCode = raw.user_code ?? raw.usercode;
  if (!raw.device_auth_id || !userCode) {
    throw new Error("ChatGPT device login returned an incomplete response.");
  }
  const parsedInterval = Number(raw.interval);
  return {
    deviceAuthId: raw.device_auth_id,
    userCode,
    verificationUrl: `${CHATGPT_ISSUER}/codex/device`,
    interval: Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 5,
    expiresAt: Date.now() + DEVICE_CODE_TTL_MS,
  };
}

export async function pollChatGPTDeviceCode(
  device: Pick<ChatGPTDeviceCode, "deviceAuthId" | "userCode">,
): Promise<ChatGPTDevicePollResult> {
  const response = await fetch(`${CHATGPT_ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      device_auth_id: device.deviceAuthId,
      user_code: device.userCode,
    }),
  });
  if ([403, 404, 429].includes(response.status)) return { status: "pending" };
  if (!response.ok) {
    throw new Error(
      `ChatGPT authorization failed (${response.status}): ${await safeText(response)}`,
    );
  }
  const raw = (await response.json()) as {
    authorization_code?: string;
    code_verifier?: string;
  };
  if (!raw.authorization_code || !raw.code_verifier) return { status: "pending" };
  return {
    status: "authorized",
    authorizationCode: raw.authorization_code,
    codeVerifier: raw.code_verifier,
  };
}

function normalizeTokens(
  raw: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  },
  previousRefreshToken?: string,
): ChatGPTTokens {
  if (!raw.access_token) throw new Error("ChatGPT token response did not include an access token.");
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? previousRefreshToken,
    idToken: raw.id_token,
    accountId: deriveAccountId(raw.id_token) ?? deriveAccountId(raw.access_token),
    expiresAt:
      typeof raw.expires_in === "number"
        ? Date.now() + raw.expires_in * 1000
        : tokenExpiry(raw.access_token),
  };
}

export async function exchangeChatGPTDeviceCode(
  poll: Extract<ChatGPTDevicePollResult, { status: "authorized" }>,
): Promise<ChatGPTTokens> {
  const response = await fetch(`${CHATGPT_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CHATGPT_CLIENT_ID,
      code: poll.authorizationCode,
      code_verifier: poll.codeVerifier,
      redirect_uri: `${CHATGPT_ISSUER}/deviceauth/callback`,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `ChatGPT token exchange failed (${response.status}): ${await safeText(response)}`,
    );
  }
  return normalizeTokens(await response.json());
}

async function refreshChatGPTTokens(refreshToken: string): Promise<ChatGPTTokens> {
  const response = await fetch(`${CHATGPT_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CHATGPT_CLIENT_ID,
      scope: CHATGPT_SCOPE,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `ChatGPT session refresh failed (${response.status}): ${await safeText(response)}`,
    );
  }
  return normalizeTokens(await response.json(), refreshToken);
}

/**
 * Fresh session, refreshing when inside the expiry margin. Throws with a
 * reconnect message when no session exists or refresh is impossible —
 * callers (turn start, model listing) fail fast instead of 401ing mid-turn.
 */
export async function getFreshChatGPTSession(): Promise<ChatGPTTokens> {
  const tokens = readChatGPTSession();
  if (!tokens) throw new Error("Connect a ChatGPT account in Settings before using this model.");
  const expiresAt = tokens.expiresAt ?? tokenExpiry(tokens.accessToken);
  if (!expiresAt || expiresAt > Date.now() + EXPIRY_MARGIN_MS) return tokens;
  if (!tokens.refreshToken)
    throw new Error("Your ChatGPT session expired. Connect it again in Settings.");
  const refreshed = await refreshChatGPTTokens(tokens.refreshToken);
  writeChatGPTSession(refreshed);
  return refreshed;
}

// --- codex session fetch (auth headers + body normalization, verbatim) ---

function normalizeCodexBody(body: Record<string, unknown>): Record<string, unknown> {
  const output = { ...body };
  output.instructions ??=
    "You are CAIDE's coding agent. Build and repair complete production-quality mobile applications.";
  output.store = false;
  output.reasoning = {
    effort: "medium",
    summary: "auto",
    ...(isRecord(output.reasoning) ? output.reasoning : {}),
  };
  output.text = {
    verbosity: "medium",
    ...(isRecord(output.text) ? output.text : {}),
  };
  const include = new Set(
    Array.isArray(output.include)
      ? output.include.filter((item): item is string => typeof item === "string")
      : [],
  );
  include.add("reasoning.encrypted_content");
  output.include = [...include];
  if (Array.isArray(output.input)) {
    output.input = output.input
      .filter((item) => !(isRecord(item) && item.type === "item_reference"))
      .map((item) => {
        if (!isRecord(item) || !("id" in item)) return item;
        const { id: _id, ...rest } = item;
        return rest;
      });
  }
  delete output.max_output_tokens;
  delete output.max_completion_tokens;
  return output;
}

function codexTargetUrl(input: string): string {
  const parsed = new URL(input, "https://placeholder.invalid");
  let pathname = parsed.pathname;
  if (pathname.startsWith("/v1/")) pathname = pathname.slice(3);
  if (pathname.startsWith("/backend-api/codex/"))
    pathname = pathname.slice("/backend-api/codex".length);
  const target = new URL(`${CHATGPT_CODEX_BASE_URL}${pathname}${parsed.search}`);
  target.searchParams.set("client_version", CHATGPT_CLIENT_VERSION);
  return target.toString();
}

/**
 * Authenticated fetch against the Codex backend: fresh session tokens,
 * account headers, experimental responses flag, and body normalization.
 * Plain fetch signature (no AI-SDK dependency) so turns, discovery, and
 * validation share it.
 */
export async function chatGPTCodexFetch(input: string, init?: RequestInit): Promise<Response> {
  const tokens = await getFreshChatGPTSession();
  const accountId =
    tokens.accountId ?? deriveAccountId(tokens.idToken) ?? deriveAccountId(tokens.accessToken);
  if (!accountId)
    throw new Error("The ChatGPT session is missing an account identifier. Connect it again.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  headers.set("chatgpt-account-id", accountId);
  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("originator", "codex_cli_rs");
  let body = init?.body;
  if (new URL(codexTargetUrl(input)).pathname.endsWith("/responses") && typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (isRecord(parsed)) body = JSON.stringify(normalizeCodexBody(parsed));
    } catch {
      // Preserve non-JSON bodies so the upstream service can report them.
    }
  }
  return fetch(codexTargetUrl(input), {
    method: init?.method ?? "GET",
    headers,
    body: body ?? undefined,
    signal: init?.signal ?? undefined,
  });
}

export async function listChatGPTModels(): Promise<string[]> {
  const response = await chatGPTCodexFetch(`${CHATGPT_CODEX_BASE_URL}/models`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Could not load ChatGPT models (${response.status}).`);
  const value: unknown = await response.json();
  const lists = Array.isArray(value)
    ? [value]
    : isRecord(value)
      ? [value.models, value.data, value.items, value.available_models].filter(Array.isArray)
      : [];
  const models = new Set<string>();
  for (const list of lists) {
    for (const item of list as unknown[]) {
      const candidate =
        typeof item === "string"
          ? item
          : isRecord(item)
            ? (item.slug ?? item.id ?? item.model ?? item.name)
            : undefined;
      if (typeof candidate === "string" && candidate.trim()) models.add(candidate.trim());
    }
  }
  return [...models];
}

// --- login state machine (donor handler semantics, UI opens the URL) ---

let pendingDevice: ChatGPTDeviceCode | undefined;
let lastPollAt = 0;
let pollInFlight: Promise<ChatGPTStatus> | undefined;

function tokenExchangeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("token_exchange_user_error") ||
    message.includes("ChatGPT token exchange failed (400)")
  ) {
    return "OpenAI could not complete this verification code. Start a new sign-in and do not reuse the completed code.";
  }
  return "The ChatGPT connection could not be completed. Start a new sign-in to get a fresh verification code.";
}

export function getChatGPTStatus(): ChatGPTStatus {
  const tokens = readChatGPTSession();
  if (!tokens) return { status: "unauthenticated" };
  const user = getChatGPTUser(tokens);
  if (!user) {
    return {
      status: "error",
      message: "The saved ChatGPT session is incomplete. Connect it again.",
    };
  }
  if (tokens.expiresAt && tokens.expiresAt <= Date.now() && !tokens.refreshToken) {
    return { status: "expired", user, message: "This ChatGPT session has expired." };
  }
  return { status: "authenticated", user };
}

/**
 * Start device login. The UI must open verificationUrl for the user (donor
 * opened it via shell); consentAccepted mirrors the donor consent checkbox.
 */
export async function startChatGPTLogin(consentAccepted: boolean): Promise<ChatGPTStatus> {
  if (consentAccepted !== true) throw new Error("Consent is required before connecting ChatGPT.");
  pendingDevice = await requestChatGPTDeviceCode();
  lastPollAt = 0;
  pollInFlight = undefined;
  return {
    status: "pending",
    userCode: pendingDevice.userCode,
    verificationUrl: pendingDevice.verificationUrl,
    interval: pendingDevice.interval,
    expiresAt: pendingDevice.expiresAt,
  };
}

export async function pollChatGPTLogin(): Promise<ChatGPTStatus> {
  if (!pendingDevice) return getChatGPTStatus();
  if (Date.now() >= pendingDevice.expiresAt) {
    pendingDevice = undefined;
    return { status: "expired", message: "The login code expired. Start a new connection." };
  }
  if (pollInFlight) return pollInFlight;
  const minimumDelay = pendingDevice.interval * 1000;
  if (lastPollAt && Date.now() - lastPollAt < minimumDelay) return { status: "pending" };
  lastPollAt = Date.now();
  const device = pendingDevice;
  pollInFlight = (async (): Promise<ChatGPTStatus> => {
    const result = await pollChatGPTDeviceCode(device);
    if (result.status === "pending") return { status: "pending" };
    // Authorization codes are single-use: clear before exchange so a second
    // poll cannot resubmit the same code.
    pendingDevice = undefined;
    try {
      const tokens = await exchangeChatGPTDeviceCode(result);
      writeChatGPTSession(tokens);
      const user = getChatGPTUser(tokens);
      if (!user) {
        clearChatGPTSession();
        return {
          status: "error",
          message: "OpenAI connected but did not return an account identity. Start a new sign-in.",
        };
      }
      return { status: "authenticated", user };
    } catch (error) {
      console.warn("[chatgpt] token exchange was not completed", error);
      return { status: "error", message: tokenExchangeMessage(error) };
    }
  })().finally(() => {
    pollInFlight = undefined;
  });
  return pollInFlight;
}

export function logoutChatGPT(): void {
  pendingDevice = undefined;
  pollInFlight = undefined;
  clearChatGPTSession();
}

/** Test-only: reset the in-flight login state. */
export function resetChatGPTLoginForTests(): void {
  pendingDevice = undefined;
  lastPollAt = 0;
  pollInFlight = undefined;
}
