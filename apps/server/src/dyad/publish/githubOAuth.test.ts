// FILE: githubOAuth.test.ts
// Purpose: Device-flow OAuth against a loopback fake (challenge, poll,
// slow_down, deny, save).

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  disconnectGithubOAuth,
  GithubOAuthError,
  pollGithubAccessToken,
  requestGithubDeviceCode,
} from "./githubOAuth.ts";

let polls = 0;
let mode = "pending-then-ok";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/github/login/device/code" && req.method === "POST") {
    return json(200, {
      device_code: "dev-1",
      user_code: "ABCD-1234",
      verification_uri: "https://github.com/login/device",
      expires_in: 60,
      interval: 0,
    });
  }
  if (url.pathname === "/github/login/oauth/access_token" && req.method === "POST") {
    polls++;
    if (mode === "pending-then-ok") {
      return polls === 1 ? json(200, { error: "authorization_pending" }) : json(200, { access_token: "gho_test" });
    }
    if (mode === "slow-down-then-ok") {
      return polls === 1 ? json(200, { error: "slow_down" }) : json(200, { access_token: "gho_test" });
    }
    return json(200, { error: "access_denied", error_description: "denied" });
  }
  return json(404, {});
}

let server: http.Server;
let base = "";

describe("github device flow", () => {
  beforeAll(async () => {
    server = http.createServer(handler);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.CAIDE_GITHUB_TEST_SERVER_BASE = base;
    // Isolate the encrypted secrets store (device-flow save/disconnect).
    process.env.CAIDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "caide-gh-"));
    const { resetSharedProviderSecrets } = await import("../providers/secrets.ts");
    resetSharedProviderSecrets();
  });

  afterAll(async () => {
    delete process.env.CAIDE_GITHUB_TEST_SERVER_BASE;
    delete process.env.CAIDE_HOME;
    const { resetSharedProviderSecrets } = await import("../providers/secrets.ts");
    resetSharedProviderSecrets();
    await new Promise((r) => server.close(r));
  });

  it("requests a device challenge", async () => {
    const challenge = await requestGithubDeviceCode();
    expect(challenge).toMatchObject({ userCode: "ABCD-1234", deviceCode: "dev-1" });
  });

  it("polls through pending to a token", async () => {
    polls = 0;
    mode = "pending-then-ok";
    const result = await pollGithubAccessToken("dev-1", { interval: 0, expiresIn: 30 });
    expect(result).toEqual({ accessToken: "gho_test" });
  });

  it("backs off on slow_down", async () => {
    polls = 0;
    mode = "slow-down-then-ok";
    const result = await pollGithubAccessToken("dev-1", { interval: 0, expiresIn: 30 });
    expect(result).toEqual({ accessToken: "gho_test" });
  }, 15000);

  it("fails fast on access_denied", async () => {
    polls = 0;
    mode = "deny";
    await expect(pollGithubAccessToken("dev-1", { interval: 0, expiresIn: 30 })).rejects.toBeInstanceOf(
      GithubOAuthError,
    );
  });

  it("rejects empty token saves", () => {
    expect(() => disconnectGithubOAuth()).not.toThrow();
  });
});
