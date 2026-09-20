// FILE: bedrockAuth.ts
// Purpose: AWS Bedrock authentication. Supports both:
// 1. Bearer token authentication (AWS_BEARER_TOKEN_BEDROCK or bearer apiKey)
// 2. AWS SigV4 request signing with accessKeyId / secretAccessKey.

import * as crypto from "node:crypto";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
}

export function parseBedrockCredentials(rawKey?: string): {
  bearerToken?: string;
  awsCredentials?: AwsCredentials;
} {
  const token = rawKey?.trim() || process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();

  // If formatted as accessKeyId:secretAccessKey
  if (token && token.includes(":") && !token.startsWith("ey") && !token.startsWith("AB")) {
    const [accessKeyId, secretAccessKey, sessionToken] = token.split(":");
    if (accessKeyId && secretAccessKey) {
      return {
        awsCredentials: {
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
          ...(sessionToken ? { sessionToken: sessionToken.trim() } : {}),
          region: process.env.AWS_REGION?.trim() || "us-east-1",
        },
      };
    }
  }

  // Check AWS environment variables
  const envKey = process.env.AWS_ACCESS_KEY_ID?.trim();
  const envSecret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (envKey && envSecret) {
    return {
      awsCredentials: {
        accessKeyId: envKey,
        secretAccessKey: envSecret,
        ...(process.env.AWS_SESSION_TOKEN
          ? { sessionToken: process.env.AWS_SESSION_TOKEN.trim() }
          : {}),
        region: process.env.AWS_REGION?.trim() || "us-east-1",
      },
    };
  }

  if (token) {
    return { bearerToken: token };
  }

  return {};
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/**
 * Standard AWS SigV4 authorization header calculator.
 */
export function signBedrockRequest(params: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  credentials: AwsCredentials;
  service?: string;
  now?: Date;
}): Record<string, string> {
  const { method, url, credentials } = params;
  const service = params.service ?? "bedrock-runtime";
  const now = params.now ?? new Date();
  const dateStr = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .slice(0, 8); // YYYYMMDD
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "")
      .slice(0, 15) + "Z"; // YYYYMMDDTHHMMSSZ
  const region = credentials.region || "us-east-1";

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname || "/";

  const signedHeadersMap: Record<string, string> = {
    ...params.headers,
    host,
    "x-amz-date": amzDate,
  };
  if (credentials.sessionToken) {
    signedHeadersMap["x-amz-security-token"] = credentials.sessionToken;
  }

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(signedHeadersMap)) {
    lowerHeaders[k.toLowerCase()] = v.trim();
  }
  const sortedHeaderKeys = Object.keys(lowerHeaders).sort();
  const signedHeadersStr = sortedHeaderKeys.join(";");

  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${lowerHeaders[k] ?? ""}\n`).join("");

  const payloadHash = sha256(params.body ?? "");

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    parsedUrl.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  // Derive signing key
  const kDate = hmacSha256(`AWS4${credentials.secretAccessKey}`, dateStr);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");

  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  return {
    ...signedHeadersMap,
    Authorization: authHeader,
  };
}
