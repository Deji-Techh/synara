import { describe, it, expect } from "vitest";

import { extractPreviewUrl, normalizePreviewUrl, PORT_CONFLICT_PATTERN } from "./manager.ts";

describe("extractPreviewUrl", () => {
  it("matches plain localhost dev-server URLs", () => {
    expect(extractPreviewUrl("Serving on http://localhost:8081")).toBe("http://localhost:8081");
  });

  it("matches Expo Metro 'waiting on' phrasing", () => {
    expect(extractPreviewUrl("Web is waiting on http://localhost:8081")).toBe(
      "http://localhost:8081",
    );
  });

  it("rewrites 0.0.0.0 to localhost for iframe rendering", () => {
    expect(extractPreviewUrl("Running on http://0.0.0.0:8081")).toBe("http://localhost:8081");
  });

  it("strips ANSI color codes before matching", () => {
    expect(extractPreviewUrl("Serving on \u001b[32mhttp://localhost:5173\u001b[0m")).toBe(
      "http://localhost:5173",
    );
  });

  it("ignores exp:// deep links and lines without URLs", () => {
    expect(extractPreviewUrl("Scan the QR with exp://192.168.1.5:8081")).toBeNull();
    expect(extractPreviewUrl("Starting Metro Bundler")).toBeNull();
  });
});

describe("normalizePreviewUrl", () => {
  it("leaves localhost URLs untouched", () => {
    expect(normalizePreviewUrl("http://localhost:8081/")).toBe("http://localhost:8081/");
  });
});

describe("PORT_CONFLICT_PATTERN", () => {
  it("matches node and expo port-taken output", () => {
    expect(
      PORT_CONFLICT_PATTERN.test("Error: listen EADDRINUSE: address already in use :::8081"),
    ).toBe(true);
    expect(PORT_CONFLICT_PATTERN.test("Port 8081 is already in use")).toBe(true);
    expect(PORT_CONFLICT_PATTERN.test("Port 8081 is running vento-rn in another window")).toBe(
      true,
    );
    expect(
      PORT_CONFLICT_PATTERN.test("Input is required, but 'npx expo' is in non-interactive mode"),
    ).toBe(false);
    expect(PORT_CONFLICT_PATTERN.test("> Use port 8082 instead?")).toBe(true);
  });

  it("ignores normal startup lines", () => {
    expect(PORT_CONFLICT_PATTERN.test("Waiting on http://localhost:8081")).toBe(false);
    expect(PORT_CONFLICT_PATTERN.test("Starting Metro Bundler")).toBe(false);
  });
});
