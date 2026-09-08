// FILE: useWebSpeechElectron.test.ts
// Purpose: Proves the packaged-Electron gate — the API surface exists in
// Chromium but the speech service is unreachable, so supported must be
// false even when the constructor is present.

// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ isElectron: true }));

import { isWebSpeechSupported } from "./useWebSpeechTranscription";

describe("web speech Electron gate", () => {
  it("reports unsupported in Electron despite the API surface", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      class FakeRecognition {};
    expect(isWebSpeechSupported()).toBe(false);
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });
});
