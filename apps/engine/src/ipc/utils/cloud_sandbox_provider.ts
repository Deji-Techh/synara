// FILE: src/ipc/utils/cloud_sandbox_provider.ts
// Purpose: Stub — cloud sandbox previews (web-app sandboxing, share links,
// status sync) are stripped in the Flutter-only engine. Signatures follow the
// appContracts schemas so the typed handlers in app_handlers stay valid;
// creation/share-link surface a classified error, status getters degrade.

import type { z } from "zod";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { CloudSandboxStatusSchema } from "../types/app";

type CloudSandboxStatus = z.infer<typeof CloudSandboxStatusSchema>;

export class CloudSandboxApiError extends CaideError {
  constructor(message: string) {
    super(message, CaideErrorKind.External);
  }
}

export function createCloudSandboxShareLink(
  _sandboxId: string,
  _options?: { expiresInSeconds?: number },
): Promise<{
  sandboxId: string;
  shareLinkId: string;
  url: string;
  expiresAt: string;
}> {
  return Promise.reject(
    new CloudSandboxApiError(
      "Cloud sandbox previews are not available in the Flutter Builder engine.",
    ),
  );
}

export function getCloudSandboxStatus(_sandboxId: string): Promise<CloudSandboxStatus | null> {
  return Promise.resolve({
    sandboxId: "",
    status: "stopped",
    previewUrl: "",
    previewAuthToken: "",
  } as CloudSandboxStatus);
}

export function reconcileCloudSandboxes(): Promise<string[]> {
  return Promise.resolve([]);
}

export function restartCloudSandbox(_sandboxId: string): Promise<CloudSandboxStatus> {
  return Promise.resolve({
    sandboxId: "",
    status: "stopped",
    previewUrl: "",
    previewAuthToken: "",
  } as CloudSandboxStatus);
}

export function stopCloudSandboxFileSync(_payload?: unknown): void {
  // no-op
}

export function unregisterRunningCloudSandbox(..._args: unknown[]): void {
  // no-op
}

export function queueCloudSandboxSnapshotSync(_payload?: unknown): void {
  // no-op: cloud sandbox previews are not part of the Flutter Builder engine.
}

export function streamCloudSandboxLogs(_options?: unknown): { dispose: () => void } {
  return { dispose: () => {} };
}

export function registerCloudSandboxSyncUpdateListener(_listener?: unknown): void {
  // no-op
}

export function buildCloudSandboxFileMap(): Promise<Record<string, Uint8Array>> {
  return Promise.resolve({});
}

export function createCloudSandbox(_input?: unknown): Promise<never> {
  return Promise.reject(
    new CloudSandboxApiError(
      "Cloud sandbox previews are not available in the Flutter Builder engine.",
    ),
  );
}

export function destroyCloudSandbox(_input?: unknown): Promise<void> {
  return Promise.resolve();
}

export function uploadCloudSandboxFiles(_input?: unknown): Promise<void> {
  return Promise.resolve();
}
