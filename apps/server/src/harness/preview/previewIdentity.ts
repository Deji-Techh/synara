// FILE: previewIdentity.ts
// Purpose: Installation identity for the preview control-plane API
// (device registration + Bearer auth for tunnel REST).
// Donor: dyad x caide src/ipc/services/preview_installation_identity.ts —
// Electron userData replaced with CAIDE_HOME/~/.caide (secrets.ts
// convention); fetch-based REST kept.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface PreviewIdentity {
  deviceId: string;
  accessToken: string;
}

function controlPlaneUrl(): string {
  return (
    process.env.CAIDE_PREVIEW_CONTROL_PLANE_URL?.trim() || "https://caide-preview-api.onrender.com"
  ).replace(/\/$/, "");
}

function identityPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "preview-identity.json");
}

async function request<T>(
  pathname: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${controlPlaneUrl()}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      (body && typeof body === "object" && "error" in body && body.error) ||
        `Preview API request failed (${response.status})`,
    );
  }
  return body as T;
}

export async function getPreviewIdentity(): Promise<PreviewIdentity> {
  const file = identityPath();
  try {
    const existing = JSON.parse(await fs.promises.readFile(file, "utf8")) as PreviewIdentity;
    if (existing?.deviceId && existing?.accessToken) return existing;
  } catch {
    // fall through to registration
  }
  const deviceId = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  let username = "CAIDE user";
  try {
    username = os.userInfo().username || username;
  } catch {
    // sandboxed environments may not expose user info
  }
  const registered = await request<{ accessToken: string }>("/v1/installations/register", {
    method: "POST",
    body: JSON.stringify({ deviceId, displayName: username }),
  });
  const identity = { deviceId, accessToken: registered.accessToken };
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(identity), { mode: 0o600 });
  return identity;
}

export function previewApiUrl(): string {
  return controlPlaneUrl();
}

export async function previewApiRequest<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const identity = await getPreviewIdentity();
  return request<T>(pathname, init, identity.accessToken);
}
