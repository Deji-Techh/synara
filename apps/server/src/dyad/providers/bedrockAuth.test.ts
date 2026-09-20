import { describe, it, expect } from "vitest";
import { parseBedrockCredentials, signBedrockRequest } from "./bedrockAuth.ts";

describe("bedrockAuth", () => {
  it("parses bearer token", () => {
    const res = parseBedrockCredentials("AB_sample_bearer_token_12345");
    expect(res.bearerToken).toBe("AB_sample_bearer_token_12345");
    expect(res.awsCredentials).toBeUndefined();
  });

  it("parses accessKey:secretKey formatted credentials", () => {
    const res = parseBedrockCredentials(
      "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    );
    expect(res.awsCredentials).toBeDefined();
    expect(res.awsCredentials?.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(res.awsCredentials?.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  });

  it("generates valid SigV4 authorization header", () => {
    const credentials = {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
    };
    const signed = signBedrockRequest({
      method: "POST",
      url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-haiku-20240307-v1:0/invoke",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
      credentials,
      now: new Date("2026-09-20T00:00:00Z"),
    });

    expect(signed.Authorization).toContain(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260920/us-east-1/bedrock-runtime/aws4_request",
    );
    expect(signed.Authorization).toContain("SignedHeaders=");
    expect(signed.Authorization).toContain("Signature=");
    expect(signed["x-amz-date"]).toBe("20260920T000000Z");
  });
});
