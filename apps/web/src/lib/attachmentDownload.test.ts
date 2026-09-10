// FILE: attachmentDownload.test.ts
// Purpose: Cover timeline image source resolution: local previews win,
// persisted server attachments fall back to the download route.
// Layer: Web unit test

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_DOWNLOAD_ROUTE_PATH,
  resolveAttachmentDownloadUrl,
  resolveTimelineImageSrc,
} from "./attachmentDownload";

describe("resolveTimelineImageSrc", () => {
  it("prefers the local preview url when present", () => {
    expect(
      resolveTimelineImageSrc({ id: "thread-1-abc", previewUrl: "blob:local-preview" }),
    ).toBe("blob:local-preview");
  });

  it("falls back to the download route for persisted attachments", () => {
    const src = resolveTimelineImageSrc({ id: "thread-1-abc" });
    expect(src).toContain(ATTACHMENT_DOWNLOAD_ROUTE_PATH);
    expect(src).toContain(encodeURIComponent("thread-1-abc"));
  });

  it("returns undefined without any usable identity", () => {
    expect(resolveTimelineImageSrc({ id: "" })).toBeUndefined();
  });

  it("builds the download url for an id", () => {
    expect(resolveAttachmentDownloadUrl("thread-1-abc")).toContain(
      `${ATTACHMENT_DOWNLOAD_ROUTE_PATH}?id=${encodeURIComponent("thread-1-abc")}`,
    );
  });
});
