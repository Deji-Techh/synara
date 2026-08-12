// FILE: src/preview/webServerPreview.test.ts
// Purpose: Unit tests for served-URL extraction from flutter run -d web-server
// output (the two-line "is being served at\nhttp://..." pattern, with the
// trailing-slash normalization flutter's output has).
// Layer: Engine unit test
import { describe, expect, it } from "vitest";

import { extractServedUrl } from "./webServerPreview.ts";

describe("extractServedUrl", () => {
  it("extracts the URL on the line after 'is being served at'", () => {
    const lines = [
      "Launching lib/main.dart on web-server in debug mode...",
      "lib/main.dart is being served at",
      "http://127.0.0.1:54321/",
      "The web-server device requires the Dart Debug Extension...",
    ];
    expect(extractServedUrl(lines)).toBe("http://127.0.0.1:54321");
  });

  it("strips the trailing slash from the served URL", () => {
    expect(
      extractServedUrl(["lib/main.dart is being served at", "http://127.0.0.1:3000/"]),
    ).toBe("http://127.0.0.1:3000");
  });

  it("returns null when the URL never follows the marker", () => {
    expect(extractServedUrl(["no marker here", "http://127.0.0.1:8080/"])).toBeNull();
  });

  it("returns null when no URL follows the marker", () => {
    expect(extractServedUrl(["lib/main.dart is being served at", "some other line"])).toBeNull();
  });

  it("does not match a URL on the marker line itself", () => {
    // flutter's marker line carries no URL; only the following line is read.
    expect(extractServedUrl(["is being served at http://127.0.0.1:1/"])).toBeNull();
  });
});
