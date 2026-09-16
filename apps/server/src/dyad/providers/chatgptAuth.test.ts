// FILE: chatgptAuth.test.ts
// Purpose: 009 M4 gate — ChatGPT device flow, session storage, refresh,
// identity, discovery, login state machine (stubbed fetch; no network).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeChatGPTDeviceCode,
  getChatGPTStatus,
  getChatGPTUser,
  getFreshChatGPTSession,
  listChatGPTModels,
  logoutChatGPT,
  pollChatGPTDeviceCode,
  pollChatGPTLogin,
  readChatGPTSession,
  requestChatGPTDeviceCode,
  resetChatGPTLoginForTests,
  startChatGPTLogin,
  writeChatGPTSession,
  type ChatGPTTokens,
} from "./chatgptAuth.ts";
import { resetSharedProviderSecrets } from "./secrets.ts";

function jwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
}

const ID_PAYLOAD = {
  email: "dev@example.com",
  name: "Dev",
  exp: Math.floor(Date.now() / 1000) + 3600,
  "https://api.openai.com/auth": {
    chatgpt_account_id: "acct-1",
    chatgpt_plan_type: "plus",
  },
};

function tokens(over: Partial<ChatGPTTokens> = {}): ChatGPTTokens {
  return {
    accessToken: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    refreshToken: "refresh-1",
    idToken: jwt(ID_PAYLOAD),
    accountId: "acct-1",
    expiresAt: Date.now() + 3_600_000,
    ...over,
  };
}

let prevCaideHome: string | undefined;

beforeEach(() => {
  prevCaideHome = process.env.CAIDE_HOME;
  process.env.CAIDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "caide-gpt-"));
  resetSharedProviderSecrets();
  resetChatGPTLoginForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetChatGPTLoginForTests();
  resetSharedProviderSecrets();
  if (prevCaideHome === undefined) delete process.env.CAIDE_HOME;
  else process.env.CAIDE_HOME = prevCaideHome;
});

type Route = (url: string, init?: RequestInit) => Response | undefined;

function stubFetch(route: Route): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      return route(url, init) ?? Response.json({ error: "no route" }, { status: 404 });
    }),
  );
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("chatgpt device flow (009 M4)", () => {
  it("parses identity from the session JWTs", () => {
    expect(getChatGPTUser(tokens())).toEqual({
      accountId: "acct-1",
      email: "dev@example.com",
      name: "Dev",
      plan: "plus",
    });
    expect(getChatGPTUser(undefined)).toBeUndefined();
  });

  it("round-trips the encrypted session and reports status", () => {
    expect(getChatGPTStatus()).toEqual({ status: "unauthenticated" });
    expect(readChatGPTSession()).toBeUndefined();
    writeChatGPTSession(tokens());
    expect(readChatGPTSession()?.accountId).toBe("acct-1");
    expect(getChatGPTStatus()).toMatchObject({
      status: "authenticated",
      user: { accountId: "acct-1", email: "dev@example.com" },
    });
    logoutChatGPT();
    expect(getChatGPTStatus()).toEqual({ status: "unauthenticated" });
  });

  it("requires consent to start login", async () => {
    await expect(startChatGPTLogin(false)).rejects.toThrow(/Consent is required/);
  });

  it("starts login, polls, exchanges once, then reports authenticated", async () => {
    stubFetch((url) => {
      if (url.includes("/deviceauth/usercode")) {
        return json({ device_auth_id: "d1", user_code: "ABCD-EFGH", interval: 0 });
      }
      if (url.includes("/deviceauth/token")) {
        return json({ authorization_code: "authcode-1", code_verifier: "verifier-1" });
      }
      if (url.includes("/oauth/token")) {
        return json({
          access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          refresh_token: "refresh-2",
          id_token: jwt(ID_PAYLOAD),
          expires_in: 3600,
        });
      }
      return undefined;
    });
    const started = await startChatGPTLogin(true);
    expect(started.status).toBe("pending");
    if (started.status !== "pending") throw new Error("unreachable");
    expect(started.userCode).toBe("ABCD-EFGH");
    expect(started.verificationUrl).toContain("auth.openai.com");

    const done = await pollChatGPTLogin();
    expect(done.status).toBe("authenticated");
    // Single-use code: the pending device is cleared, so a second poll
    // reads status instead of resubmitting.
    await expect(pollChatGPTLogin()).resolves.toMatchObject({ status: "authenticated" });
    expect(readChatGPTSession()?.refreshToken).toBe("refresh-2");
  });

  it("stays pending on 403/404/429 poll responses", async () => {
    stubFetch((url) => {
      if (url.includes("/deviceauth/usercode")) {
        return json({ device_auth_id: "d1", user_code: "WXYZ-1234", interval: 0 });
      }
      if (url.includes("/deviceauth/token")) return json({}, 403);
      return undefined;
    });
    await startChatGPTLogin(true);
    await expect(
      pollChatGPTDeviceCode({ deviceAuthId: "d1", userCode: "WXYZ-1234" }),
    ).resolves.toEqual({
      status: "pending",
    });
  });

  it("reports exchange failures without persisting", async () => {
    stubFetch((url) => {
      if (url.includes("/deviceauth/usercode")) {
        return json({ device_auth_id: "d1", user_code: "QQQQ-2222", interval: 0 });
      }
      if (url.includes("/deviceauth/token")) {
        return json({ authorization_code: "used-code", code_verifier: "v" });
      }
      if (url.includes("/oauth/token")) return json({ error: "bad" }, 400);
      return undefined;
    });
    await startChatGPTLogin(true);
    const done = await pollChatGPTLogin();
    expect(done.status).toBe("error");
    expect(readChatGPTSession()).toBeUndefined();
  });

  it("refreshes an expired session and fails fast without one", async () => {
    await expect(getFreshChatGPTSession()).rejects.toThrow(/Connect a ChatGPT account/);
    writeChatGPTSession(tokens({ expiresAt: Date.now() - 1_000 }));
    stubFetch((url) => {
      if (url.includes("/oauth/token")) {
        return json({
          access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          id_token: jwt(ID_PAYLOAD),
          expires_in: 3600,
        });
      }
      return undefined;
    });
    const fresh = await getFreshChatGPTSession();
    // Refresh token carried forward (donor carry-forward semantics).
    expect(fresh.refreshToken).toBe("refresh-1");
    expect(readChatGPTSession()?.refreshToken).toBe("refresh-1");
  });

  it("returns fresh sessions without network", async () => {
    const fetchSpy = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchSpy);
    writeChatGPTSession(tokens());
    await expect(getFreshChatGPTSession()).resolves.toMatchObject({ accountId: "acct-1" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("discovers models through the codex backend", async () => {
    writeChatGPTSession(tokens());
    stubFetch((url) => {
      if (url.includes("/backend-api/codex/models")) {
        // Donor discovery accepts slugs, ids, models, names — and bare strings.
        return json({ data: [{ slug: "gpt-5.5" }, { id: "gpt-5-mini" }, "gpt-5-nano"] });
      }
      return undefined;
    });
    await expect(listChatGPTModels()).resolves.toEqual(["gpt-5.5", "gpt-5-mini", "gpt-5-nano"]);
  });

  it("exchange requires an access token", async () => {
    stubFetch(() => json({ refresh_token: "r" }, 200));
    await expect(
      exchangeChatGPTDeviceCode({
        status: "authorized",
        authorizationCode: "c",
        codeVerifier: "v",
      }),
    ).rejects.toThrow(/did not include an access token/);
  });
});
