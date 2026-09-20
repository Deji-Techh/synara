// FILE: vertexAuth.ts
// Purpose: Vertex AI service account OAuth2 token generator and cache.
// Signs an RS256 JWT using node:crypto and exchanges it for a Google Cloud
// platform bearer token (valid for 1 hour). Caches tokens until expiry.

import * as crypto from "node:crypto";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export function parseServiceAccountKey(raw: string): ServiceAccountCredentials {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Service account key is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Service account key is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Service account key must be a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.client_email !== "string" || !obj.client_email) {
    throw new Error("Service account JSON missing 'client_email'.");
  }
  if (typeof obj.private_key !== "string" || !obj.private_key) {
    throw new Error("Service account JSON missing 'private_key'.");
  }
  return {
    client_email: obj.client_email,
    private_key: obj.private_key,
    ...(typeof obj.project_id === "string" ? { project_id: obj.project_id } : {}),
  };
}

export function clearVertexTokenCache(): void {
  tokenCache.clear();
}

export interface VertexAuthOptions {
  signal?: AbortSignal | undefined;
  fetchFn?: typeof fetch | undefined;
}

export async function getVertexAccessToken(
  credentialsInput: string | ServiceAccountCredentials,
  options?: VertexAuthOptions,
): Promise<{ accessToken: string; projectId?: string; clientEmail: string }> {
  const creds =
    typeof credentialsInput === "string"
      ? parseServiceAccountKey(credentialsInput)
      : credentialsInput;

  const now = Math.floor(Date.now() / 1000);
  const cacheKey = creds.client_email;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if valid for at least another 60 seconds
  if (cached && cached.expiresAt - now > 60) {
    return {
      accessToken: cached.accessToken,
      ...(creds.project_id ? { projectId: creds.project_id } : {}),
      clientEmail: creds.client_email,
    };
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsignedToken = `${b64(header)}.${b64(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signature = signer.sign(creds.private_key, "base64url");
  const jwt = `${unsignedToken}.${signature}`;

  const fetchImpl = options?.fetchFn ?? fetch;
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vertex OAuth2 exchange failed (HTTP ${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Vertex OAuth2 response missing 'access_token'.");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: now + expiresIn,
  });

  return {
    accessToken: data.access_token,
    ...(creds.project_id ? { projectId: creds.project_id } : {}),
    clientEmail: creds.client_email,
  };
}
