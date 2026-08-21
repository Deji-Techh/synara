import { describe, expect, it } from "vitest";

import {
  isSupportedLocalArtifactPath,
  isSupportedLocalImagePath,
  isSupportedLocalPdfPath,
  isSupportedLocalPreviewFilePath,
} from "./localPreviewFiles";

describe("localPreviewFiles artifact allowlist", () => {
  it("recognizes build artifacts", () => {
    expect(isSupportedLocalArtifactPath("/app/build/app/outputs/flutter-apk/app-release.apk")).toBe(
      true,
    );
    expect(
      isSupportedLocalArtifactPath("/app/build/app/outputs/bundle/release/app-release.aab"),
    ).toBe(true);
    expect(isSupportedLocalArtifactPath("/app/build/ios/ipa/Runner.ipa")).toBe(true);
    expect(isSupportedLocalArtifactPath("/app/build/app.apks")).toBe(false);
    expect(isSupportedLocalArtifactPath("/app/README.md")).toBe(false);
  });

  it("serves artifacts through the preview route without allowing inline images to drift", () => {
    expect(isSupportedLocalPreviewFilePath("/x/app-release.apk")).toBe(true);
    // Markdown inline rendering stays image-only: an APK must never be an <img>.
    expect(isSupportedLocalImagePath("/x/app-release.apk")).toBe(false);
    expect(isSupportedLocalPdfPath("/x/app-release.apk")).toBe(false);
  });
});
