// FILE: neonAuth.test.ts
// Purpose: Neon Auth lifecycle vs loopback fake (ensure/create/409,
// email config, domains, branch typing, env resolution).

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addNeonTrustedDomains,
  classifyNeonBranch,
  ensureNeonAuth,
  getNeonEmailPasswordConfig,
  listNeonTrustedDomains,
  resolveNeonBranchEnv,
  updateNeonEmailPasswordConfig,
} from "./neonAuth.ts";

let authState: "missing" | "active" | "conflict" = "missing";
let emailConfig: Record<string, boolean> = { enabled: true, require_email_verification: false };
let domains: string[] = ["https://app.example.com"];
let lastEmailPatch: unknown = null;

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== "Bearer good") return json(401, {});
  if (url.pathname === "/projects/p1/branches/b1/auth" && req.method === "GET") {
    if (authState === "active") return json(200, { base_url: "https://auth.example.com" });
    return json(404, { message: "not found" });
  }
  if (url.pathname === "/projects/p1/branches/b1/auth" && req.method === "POST") {
    if (authState === "conflict") return json(409, { message: "schema exists" });
    authState = "active";
    return json(201, { base_url: "https://auth.example.com" });
  }
  if (url.pathname === "/projects/p1/branches/b1/auth/email_and_password" && req.method === "GET") {
    return json(200, emailConfig);
  }
  if (url.pathname === "/projects/p1/branches/b1/auth/email_and_password" && req.method === "PATCH") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        lastEmailPatch = JSON.parse(body);
        Object.assign(emailConfig, lastEmailPatch);
      } catch {
        // ignore
      }
      return json(200, {});
    });
    return;
  }
  if (url.pathname === "/projects/p1/branches/b1/auth/domains" && req.method === "GET") {
    return json(200, { domains: domains.map((domain) => ({ domain })) });
  }
  if (url.pathname === "/projects/p1/branches/b1/auth/domains" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { domains?: string[] };
        domains = [...new Set([...domains, ...(parsed.domains ?? [])])];
      } catch {
        // ignore
      }
      return json(201, {});
    });
    return;
  }
  return json(404, {});
}

let server: http.Server;
let base = "";
const good = { apiKey: "good", projectId: "p1", branchId: "b1", baseUrl: "" };

describe("neon auth", () => {
  beforeAll(async () => {
    server = http.createServer(handler);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    good.baseUrl = base;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("ensures auth via 404 then create", async () => {
    authState = "missing";
    expect(await ensureNeonAuth(good)).toBe("https://auth.example.com");
    expect(await ensureNeonAuth(good)).toBe("https://auth.example.com");
  });

  it("recovers from 409 via refetch", async () => {
    authState = "conflict";
    // 409 then GET still 404 → undefined (schema exists, not enabled).
    await expect(ensureNeonAuth(good)).resolves.toBeUndefined();
  });

  it("reads and patches email verification", async () => {
    const config = await getNeonEmailPasswordConfig(good);
    expect(config.requireEmailVerification).toBe(false);
    const updated = await updateNeonEmailPasswordConfig({
      ...good,
      patch: { requireEmailVerification: true },
    });
    expect(updated.requireEmailVerification).toBe(true);
    expect(lastEmailPatch).toMatchObject({ require_email_verification: true });
  });

  it("lists and adds trusted domains", async () => {
    expect(await listNeonTrustedDomains(good)).toEqual(["https://app.example.com"]);
    await addNeonTrustedDomains({ ...good, domains: ["https://shop.example.com"] });
    expect(await listNeonTrustedDomains(good)).toContain("https://shop.example.com");
  });

  it("classifies branches and resolves env", async () => {
    expect(classifyNeonBranch({ id: "b", name: "main", primary: true })).toBe("production");
    expect(classifyNeonBranch({ id: "b", name: "dev" })).toBe("development");
    expect(classifyNeonBranch({ id: "b", name: "preview-1" })).toBe("preview");
    expect(classifyNeonBranch({ id: "b", name: "snapshot-2024" })).toBe("snapshot");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-neonenv-"));
    const resolved = await resolveNeonBranchEnv({
      appPath: dir,
      connectionUri: "postgres://x",
      neonAuthBaseUrl: "https://auth.example.com",
      isNextJs: true,
    });
    expect(resolved.cookieSecretUsed).toBe(true);
    const written = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(written).toContain("NEON_AUTH_BASE_URL=https://auth.example.com");
    expect(written).toContain("NEON_AUTH_COOKIE_SECRET=");
  });
});
