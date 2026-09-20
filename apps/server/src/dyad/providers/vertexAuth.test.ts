import { describe, it, expect, beforeEach, vi } from "vitest";
import * as crypto from "node:crypto";
import {
  clearVertexTokenCache,
  getVertexAccessToken,
  parseServiceAccountKey,
} from "./vertexAuth.ts";

describe("vertexAuth", () => {
  beforeEach(() => {
    clearVertexTokenCache();
  });

  it("parses valid service account credentials JSON", () => {
    const json = JSON.stringify({
      client_email: "test@project.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----\n",
      project_id: "test-project-123",
    });
    const parsed = parseServiceAccountKey(json);
    expect(parsed.client_email).toBe("test@project.iam.gserviceaccount.com");
    expect(parsed.project_id).toBe("test-project-123");
    expect(parsed.private_key).toContain("BEGIN PRIVATE KEY");
  });

  it("throws descriptive error on invalid service account JSON", () => {
    expect(() => parseServiceAccountKey("not-json")).toThrow(/not valid JSON/);
    expect(() => parseServiceAccountKey("{}")).toThrow(/missing 'client_email'/);
    expect(() =>
      parseServiceAccountKey(JSON.stringify({ client_email: "test@example.com" })),
    ).toThrow(/missing 'private_key'/);
  });

  it("signs JWT and exchanges for access token", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    let capturedBody = "";
    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "ya29.test-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      };
    });

    const res = await getVertexAccessToken(
      {
        client_email: "service@my-project.iam.gserviceaccount.com",
        private_key: privPem,
        project_id: "my-project",
      },
      { fetchFn: mockFetch as any },
    );

    expect(res.accessToken).toBe("ya29.test-access-token");
    expect(res.projectId).toBe("my-project");
    expect(res.clientEmail).toBe("service@my-project.iam.gserviceaccount.com");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the JWT format in the assertion parameter
    const assertionMatch = /assertion=([^&]+)/.exec(capturedBody);
    expect(assertionMatch).toBeTruthy();
    const jwt = assertionMatch?.[1] ?? "";
    const parts = jwt.split(".");
    expect(parts.length).toBe(3);

    const header = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString());
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString());
    expect(payload.iss).toBe("service@my-project.iam.gserviceaccount.com");
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");

    // Second call should return cached token without fetch
    const cachedRes = await getVertexAccessToken(
      {
        client_email: "service@my-project.iam.gserviceaccount.com",
        private_key: privPem,
        project_id: "my-project",
      },
      { fetchFn: mockFetch as any },
    );
    expect(cachedRes.accessToken).toBe("ya29.test-access-token");
    expect(mockFetch).toHaveBeenCalledTimes(1); // Cached, no second fetch
  });
});
