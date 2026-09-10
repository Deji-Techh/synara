// FILE: attachmentDownload.ts
// Purpose: Resolve viewable URLs for persisted message attachments. Server
// echoes carry bare ids (no previewUrl); the download route serves their
// bytes, while optimistic rows keep their local blob/data URLs.
// Layer: Web display helper (pure)
// Exports: resolveTimelineImageSrc, ATTACHMENT_DOWNLOAD_ROUTE_PATH

import { toAttachmentPreviewUrl } from "./wsHttpUrl";

export const ATTACHMENT_DOWNLOAD_ROUTE_PATH = "/api/attachments/download";

export function resolveAttachmentDownloadUrl(attachmentId: string): string {
  return toAttachmentPreviewUrl(
    `${ATTACHMENT_DOWNLOAD_ROUTE_PATH}?id=${encodeURIComponent(attachmentId)}`,
  );
}

export function resolveTimelineImageSrc(image: {
  readonly id: string;
  readonly previewUrl?: string | null;
}): string | undefined {
  if (image.previewUrl) {
    return image.previewUrl;
  }
  if (!image.id) {
    return undefined;
  }
  return resolveAttachmentDownloadUrl(image.id);
}
