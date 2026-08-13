// FILE: src/build/flutterBuildParse.test.ts
import { describe, expect, it } from "vitest";

import { parseFlutterBuildOutputPath } from "./flutterBuildParse.ts";

describe("parseFlutterBuildOutputPath", () => {
  it("extracts the artifact path from flutter's Built line", () => {
    const logs = [
      "Running Gradle task 'assembleRelease'...",
      "✓  Built build/app/outputs/flutter-apk/app-release.apk",
      "Running Gradle task 'assembleRelease'... Done",
    ];
    expect(parseFlutterBuildOutputPath(logs, "apk", "/fallback/app.apk")).toBe(
      "build/app/outputs/flutter-apk/app-release.apk",
    );
  });

  it("falls back to the expected path when no Built line exists", () => {
    expect(parseFlutterBuildOutputPath(["running..."], "apk", "/fallback/app.apk")).toBe(
      "/fallback/app.apk",
    );
  });

  it("matches appbundle artifacts", () => {
    const logs = ["✓  Built build/app/outputs/bundle/release/app-release.aab"];
    expect(parseFlutterBuildOutputPath(logs, "appbundle", "/fallback/app.aab")).toBe(
      "build/app/outputs/bundle/release/app-release.aab",
    );
  });
});
