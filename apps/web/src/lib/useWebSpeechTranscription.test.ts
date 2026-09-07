// FILE: useWebSpeechTranscription.test.ts
// Purpose: Covers the Web Speech hook against a fake recognizer — finals,
//          interim, cross-session accumulation, errors, and stop watchdog.
// Layer: Client utility hook tests

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useWebSpeechTranscription,
  WEB_SPEECH_STOP_FLUSH_TIMEOUT_MS,
} from "./useWebSpeechTranscription";

interface FakeAlternative {
  transcript: string;
  confidence: number;
}

type FakeResult = FakeAlternative[] & { isFinal: boolean };
type FakeResultsEvent = { resultIndex: number; results: FakeResult[] };

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onresult: ((event: FakeResultsEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.startCalls += 1;
  }

  stop() {
    this.stopCalls += 1;
  }

  abort() {
    this.abortCalls += 1;
  }
}

function makeResult(transcript: string, isFinal: boolean): FakeResult {
  const result = [{ transcript, confidence: 0.9 }] as FakeResult;
  result.isFinal = isFinal;
  return result;
}

function makeEvent(results: FakeResult[], resultIndex = 0): FakeResultsEvent {
  return { resultIndex, results: [...results] };
}

function installFakeRecognition() {
  FakeRecognition.instances = [];
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
    FakeRecognition;
}

function uninstallFakeRecognition() {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

function latestInstance(): FakeRecognition {
  const instance = FakeRecognition.instances.at(-1);
  if (!instance) throw new Error("expected a recognition instance");
  return instance;
}

beforeEach(() => {
  installFakeRecognition();
});

afterEach(() => {
  uninstallFakeRecognition();
  vi.useRealTimers();
});

describe("useWebSpeechTranscription", () => {
  it("reports unsupported and refuses to start without a constructor", () => {
    uninstallFakeRecognition();
    const { result } = renderHook(() => useWebSpeechTranscription());

    expect(result.current.isSupported).toBe(false);
    expect(() => result.current.start()).toThrow(/not supported/);
  });

  it("accumulates finals and interim, resolving the total on stop", async () => {
    const { result } = renderHook(() => useWebSpeechTranscription());
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();

    act(() => {
      recognition.onresult?.(makeEvent([makeResult("hello ", false)]));
    });
    expect(result.current.interimTranscript).toBe("hello ");

    act(() => {
      recognition.onresult?.(
        makeEvent([makeResult("hello ", false), makeResult("hello world", true)]),
      );
    });

    let transcript = "";
    act(() => {
      void result.current.stop().then((value) => {
        transcript = value;
      });
    });
    act(() => {
      recognition.onend?.();
    });
    await act(async () => {});
    expect(transcript).toBe("hello world");
    expect(result.current.isListening).toBe(false);
  });

  it("does not double-count finals that onresult re-delivers", async () => {
    const { result } = renderHook(() => useWebSpeechTranscription());
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();
    const event = makeEvent([makeResult("hello", true)]);

    act(() => {
      recognition.onresult?.(event);
      recognition.onresult?.(event);
    });

    let transcript = "";
    act(() => {
      void result.current.stop().then((value) => {
        transcript = value;
      });
    });
    act(() => {
      recognition.onend?.();
    });
    await act(async () => {});
    expect(transcript).toBe("hello");
  });

  it("carries finalized text across silence auto-restarts", async () => {
    const { result } = renderHook(() => useWebSpeechTranscription());
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();

    act(() => {
      recognition.onresult?.(makeEvent([makeResult("first part", true)]));
    });
    // Silence ends the session while the user intends to keep talking.
    act(() => {
      recognition.onend?.();
    });
    expect(recognition.startCalls).toBe(2);
    expect(result.current.isListening).toBe(true);

    // New session results start at index 0 — prior finals must survive.
    act(() => {
      recognition.onresult?.(makeEvent([makeResult("second part", true)]));
    });

    let transcript = "";
    act(() => {
      void result.current.stop().then((value) => {
        transcript = value;
      });
    });
    act(() => {
      recognition.onend?.();
    });
    await act(async () => {});
    expect(transcript).toBe("first part second part");
  });

  it("surfaces recognizer errors and tears down instead of staying stale", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useWebSpeechTranscription({ onError }));
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();

    act(() => {
      recognition.onerror?.({ error: "network" });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "network", message: expect.stringContaining("internet") }),
    );
    expect(result.current.lastError?.code).toBe("network");
    expect(result.current.isListening).toBe(false);
  });

  it("ignores benign aborted and no-speech errors", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useWebSpeechTranscription({ onError }));
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();

    act(() => {
      recognition.onerror?.({ error: "aborted" });
      recognition.onerror?.({ error: "no-speech" });
    });

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.lastError).toBeNull();
    expect(result.current.isListening).toBe(true);
  });

  it("resolves stop with the partial transcript when onend never arrives", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWebSpeechTranscription());
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();
    act(() => {
      recognition.onresult?.(makeEvent([makeResult("partial hello", true)]));
    });

    let transcript: string | undefined;
    act(() => {
      void result.current.stop().then((value) => {
        transcript = value;
      });
    });
    // The recognizer never fires onend — the watchdog must resolve anyway.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WEB_SPEECH_STOP_FLUSH_TIMEOUT_MS);
    });

    expect(transcript).toBe("partial hello");
    expect(result.current.isListening).toBe(false);
  });

  it("cancels without producing a transcript", async () => {
    const { result } = renderHook(() => useWebSpeechTranscription());
    act(() => {
      result.current.start();
    });
    const recognition = latestInstance();
    act(() => {
      recognition.onresult?.(makeEvent([makeResult("discard me", true)]));
      result.current.cancel();
    });

    let transcript = "unset";
    await act(async () => {
      transcript = await result.current.stop();
    });
    expect(transcript).toBe("");
  });
});
