// FILE: useWebSpeechTranscription.ts
// Purpose: Wraps Chromium's built-in SpeechRecognition API for live voice-to-text
//          in the renderer process. No server round-trip, no API key — just needs internet.
// Layer: Client utility hook
// Exports: useWebSpeechTranscription, isWebSpeechSupported

import { useCallback, useEffect, useRef, useState } from "react";

// Chromium exposes this under the webkit prefix (older) or unprefixed (newer).
// Electron inherits it from Chromium. Only available in the renderer web context.
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type SpeechRecognitionInstance = InstanceType<typeof webkitSpeechRecognition>;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scoped = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scoped.webkitSpeechRecognition ?? scoped.SpeechRecognition ?? null;
}

/** Whether the current runtime supports the Web Speech API. */
export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/**
 * How long `stop()` waits for the recognizer's final `onend` before giving up
 * and resolving with whatever transcript was accumulated. Without this the UI
 * can wedge in "transcribing" forever when the recognizer never finalizes
 * (network stall, speech-service flakiness).
 */
export const WEB_SPEECH_STOP_FLUSH_TIMEOUT_MS = 3_500;

export interface WebSpeechErrorInfo {
  /** Raw `SpeechRecognitionErrorEvent.error` code (e.g. "not-allowed", "network"). */
  readonly code: string;
  /** Human-readable description suitable for a toast. */
  readonly message: string;
}

export interface UseWebSpeechTranscriptionOptions {
  /**
   * Called once per recognizer error (never for self-inflicted "aborted" or
   * benign "no-speech"). Stored in a ref — identity changes are cheap.
   */
  readonly onError?: (info: WebSpeechErrorInfo) => void;
  /** Override for the `stop()` flush watchdog (tests). */
  readonly stopFlushTimeoutMs?: number;
}

export interface UseWebSpeechTranscriptionResult {
  /** Whether the Web Speech API is available in this runtime. */
  readonly isSupported: boolean;
  /** Whether the recognizer is actively listening. */
  readonly isListening: boolean;
  /** Interim (not-yet-finalized) transcript updated in real time. */
  readonly interimTranscript: string;
  /** Last recognizer error, if any. Cleared on the next `start()`. */
  readonly lastError: WebSpeechErrorInfo | null;
  /** Start listening. Throws when unsupported or offline. */
  readonly start: () => void;
  /**
   * Stop listening and return the accumulated final transcript.
   * Resolves once the recognizer flushes its last result, or with the partial
   * transcript after `stopFlushTimeoutMs` when the recognizer never finalizes.
   */
  readonly stop: () => Promise<string>;
  /** Cancel without producing a transcript. */
  readonly cancel: () => void;
}

function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked for speech recognition. Allow microphone access and try again.";
    case "audio-capture":
      return "No microphone was found for speech recognition.";
    case "network":
      return "Speech recognition needs an internet connection to reach Google's servers.";
    case "language-not-supported":
      return "Your browser language is not supported by speech recognition.";
    default:
      return `Speech recognition failed (${code}).`;
  }
}

function joinTranscriptSegments(segments: readonly string[]): string {
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(" ");
}

/**
 * React hook wrapping the Web Speech API (`webkitSpeechRecognition`).
 *
 * Key design notes (from Electron-specific research):
 * - Only works in the **renderer** web context (not Node / preload).
 * - Mic permissions are already granted by Caide's `configureMediaPermissions()`,
 *   but the recognizer has its own permission path — `not-allowed` is surfaced
 *   via `onError`/`lastError` instead of failing silently.
 * - The API silently ends sessions after silence or ~60s; we auto-restart while
 *   intended, carrying already-finalized text across sessions so pauses don't
 *   wipe earlier speech.
 * - Requires internet — a `"network"` error is surfaced, not swallowed.
 * - `lang` defaults to the user's browser locale.
 */
export function useWebSpeechTranscription(
  options: UseWebSpeechTranscriptionOptions = {},
): UseWebSpeechTranscriptionResult {
  const [isSupported] = useState<boolean>(isWebSpeechSupported);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [lastError, setLastError] = useState<WebSpeechErrorInfo | null>(null);

  // Mutable refs so callbacks inside the recognition instance can read current
  // state without re-binding event handlers.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const intentionallyListeningRef = useRef(false);
  // Finalized text from previous recognizer sessions (auto-restart wipes the
  // per-session results array, so finalized text must be carried explicitly).
  const committedTranscriptRef = useRef<string>("");
  // Finals consumed from the *current* session, tracked by result index so a
  // repeated `onresult` event never double-counts.
  const sessionFinalsRef = useRef<string[]>([]);
  // Highest result index (exclusive) already consumed as final in this session.
  const consumedFinalIndexRef = useRef(0);
  const stopResolverRef = useRef<((transcript: string) => void) | null>(null);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlushTimeoutMs = options.stopFlushTimeoutMs ?? WEB_SPEECH_STOP_FLUSH_TIMEOUT_MS;
  const stopFlushTimeoutRef = useRef(stopFlushTimeoutMs);
  stopFlushTimeoutRef.current = stopFlushTimeoutMs;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const readTotalTranscript = useCallback((): string => {
    const committed = committedTranscriptRef.current;
    const session = joinTranscriptSegments(sessionFinalsRef.current);
    return joinTranscriptSegments([committed, session]);
  }, []);

  const clearStopWatchdog = useCallback(() => {
    if (stopWatchdogRef.current !== null) {
      clearTimeout(stopWatchdogRef.current);
      stopWatchdogRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearStopWatchdog();
    const recognition = recognitionRef.current;
    if (recognition) {
      // Prevent the onend auto-restart from firing.
      intentionallyListeningRef.current = false;
      try {
        recognition.abort();
      } catch {
        // Already stopped — ignore.
      }
      recognitionRef.current = null;
    } else {
      intentionallyListeningRef.current = false;
    }
    setIsListening(false);
    setInterimTranscript("");

    // If a stop() promise is pending, resolve it with whatever we accumulated.
    const resolver = stopResolverRef.current;
    if (resolver) {
      stopResolverRef.current = null;
      resolver(readTotalTranscript().trim());
    }
  }, [clearStopWatchdog, readTotalTranscript]);

  // Clean up on unmount.
  useEffect(() => teardown, [teardown]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      throw new Error("Web Speech API is not supported in this browser.");
    }
    // Tear down any existing session first.
    teardown();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Web Speech API requires an internet connection.");
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    // Use a short maxAlternatives for speed — we only need the top result.
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    committedTranscriptRef.current = "";
    sessionFinalsRef.current = [];
    consumedFinalIndexRef.current = 0;
    intentionallyListeningRef.current = true;
    setLastError(null);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const sessionFinals = sessionFinalsRef.current;
      let sessionInterim = "";
      let consumed = consumedFinalIndexRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;
        const transcript = result[0].transcript;
        if (result.isFinal) {
          // Only consume finals at or beyond the high-water mark — `onresult`
          // re-delivers earlier results on every event.
          if (i >= consumed) {
            sessionFinals.push(transcript);
            consumed = i + 1;
          }
        } else {
          sessionInterim += transcript;
        }
      }

      consumedFinalIndexRef.current = consumed;
      setInterimTranscript(sessionInterim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const error = event.error;
      // "aborted" fires when we call .abort() ourselves — not a real error.
      if (error === "aborted") return;

      // "no-speech" fires after silence — the onend handler will auto-restart.
      if (error === "no-speech") return;

      // Real errors: network failure, not-allowed, etc. Surface them instead
      // of failing silently, then tear down so callers never observe a stale
      // "listening" state.
      const info: WebSpeechErrorInfo = { code: error, message: describeRecognitionError(error) };
      setLastError(info);
      onErrorRef.current?.(info);
      teardown();
    };

    // The Web Speech API has a habit of ending sessions after silence or ~60s.
    // Auto-restart if the user is still intended to be recording, carrying
    // finalized text forward so the new (empty) session doesn't wipe it.
    recognition.onend = () => {
      if (intentionallyListeningRef.current) {
        committedTranscriptRef.current = readTotalTranscript();
        sessionFinalsRef.current = [];
        consumedFinalIndexRef.current = 0;
        setInterimTranscript("");
        try {
          recognition.start();
        } catch {
          // If restart fails, finalize.
          teardown();
        }
        return;
      }

      // Intentional stop — resolve any pending promise.
      clearStopWatchdog();
      setIsListening(false);
      setInterimTranscript("");
      const resolver = stopResolverRef.current;
      if (resolver) {
        stopResolverRef.current = null;
        resolver(readTotalTranscript().trim());
      }
    };

    recognition.start();
    setIsListening(true);
  }, [clearStopWatchdog, readTotalTranscript, teardown]);

  const stop = useCallback((): Promise<string> => {
    if (!recognitionRef.current || !intentionallyListeningRef.current) {
      return Promise.resolve(readTotalTranscript().trim());
    }

    intentionallyListeningRef.current = false;

    return new Promise<string>((resolve) => {
      stopResolverRef.current = resolve;
      // Watchdog: if the recognizer never fires `onend` (network stall,
      // speech-service flakiness), resolve with the partial transcript instead
      // of wedging the UI in "transcribing" forever.
      clearStopWatchdog();
      stopWatchdogRef.current = setTimeout(() => {
        stopWatchdogRef.current = null;
        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        if (recognition) {
          try {
            recognition.abort();
          } catch {
            // Already stopped — ignore.
          }
        }
        setIsListening(false);
        setInterimTranscript("");
        stopResolverRef.current = null;
        resolve(readTotalTranscript().trim());
      }, stopFlushTimeoutRef.current);
      try {
        // .stop() triggers one final onresult with isFinal=true, then onend.
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
        clearStopWatchdog();
        resolve(readTotalTranscript().trim());
        stopResolverRef.current = null;
        teardown();
      }
    });
  }, [clearStopWatchdog, readTotalTranscript, teardown]);

  const cancel = useCallback(() => {
    committedTranscriptRef.current = "";
    sessionFinalsRef.current = [];
    consumedFinalIndexRef.current = 0;
    teardown();
  }, [teardown]);

  return {
    isSupported,
    isListening,
    interimTranscript,
    lastError,
    start,
    stop,
    cancel,
  };
}
