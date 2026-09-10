// FILE: attachmentUpload.ts
// Purpose: Persist raw composer-upload bytes for the HTTP attachment routes
// using the legacy id-addressed file layout (attachmentStore), so staged
// uploads, transcript downloads, and turn-time reads share one layout.
// Layer: Server HTTP helper
// Exports: storeAttachmentBytes, deleteAttachmentBytes,
// MAX_ATTACHMENT_UPLOAD_BYTES

import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";

import { Effect } from "effect";

import { ATTACHMENT_FILENAME_EXTENSIONS, createAttachmentId } from "./attachmentStore.ts";
import {
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths.ts";
import { inferAttachmentExtension, inferImageExtension } from "./imageMime.ts";

export const MAX_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024;

export class AttachmentUploadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AttachmentUploadError";
    this.status = status;
  }
}

export function attachmentFileExtension(input: {
  readonly type: "image" | "file";
  readonly name: string;
  readonly mimeType: string;
}): string {
  return input.type === "image"
    ? inferImageExtension({ mimeType: input.mimeType, fileName: input.name })
    : inferAttachmentExtension({ mimeType: input.mimeType, fileName: input.name });
}

export function buildAttachmentId(threadId: string): string | null {
  return createAttachmentId(threadId);
}

export function storeAttachmentBytes(input: {
  readonly attachmentsDir: string;
  readonly attachmentId: string;
  readonly type: "image" | "file";
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}): Effect.Effect<void, AttachmentUploadError> {
  // Note: effect-smol (this repo's Effect fork) has no Effect.zipLeft —
  // sequence with gen/pipe combinators only.
  return Effect.tryPromise({
    try: async () => {
      const relativePath = `${input.attachmentId}${attachmentFileExtension(input)}`;
      const filePath = resolveAttachmentRelativePath({
        attachmentsDir: input.attachmentsDir,
        relativePath,
      });
      if (!filePath) {
        throw new AttachmentUploadError("Attachment storage path is invalid.", 500);
      }
      await nodeFs.mkdir(nodePath.dirname(filePath), { recursive: true });
      await nodeFs.writeFile(filePath, input.bytes, { mode: 0o600 });
      await nodeFs.chmod(filePath, 0o600).catch(() => undefined);
    },
    catch: (cause) =>
      cause instanceof AttachmentUploadError
        ? cause
        : new AttachmentUploadError("Failed to persist attachment bytes.", 500),
  });
}

function candidateAttachmentPaths(attachmentsDir: string, attachmentId: string): string[] {
  const normalized = normalizeAttachmentRelativePath(attachmentId);
  if (!normalized || normalized.includes("/") || normalized.includes(".")) {
    return [];
  }
  const paths: string[] = [];
  for (const extension of ATTACHMENT_FILENAME_EXTENSIONS) {
    const filePath = resolveAttachmentRelativePath({
      attachmentsDir,
      relativePath: `${normalized}${extension}`,
    });
    if (filePath) {
      paths.push(filePath);
    }
  }
  return paths;
}

export function deleteAttachmentBytes(input: {
  readonly attachmentsDir: string;
  readonly attachmentId: string;
}): Effect.Effect<void, never> {
  return Effect.tryPromise({
    try: async () => {
      for (const filePath of candidateAttachmentPaths(input.attachmentsDir, input.attachmentId)) {
        await nodeFs.unlink(filePath).catch(() => undefined);
      }
    },
    catch: () => undefined,
  }).pipe(Effect.ignore);
}
