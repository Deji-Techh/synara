// FILE: useWebSpeechTranscription.ts
// Purpose: Wraps Chrome's built-in webkitSpeechRecognition API for live voice-to-text
//          in the renderer process. No server round-trip, no API key — just needs internet.
// Layer: Client utility hook
// Exports: useWebSpeechTranscription, isWebSpeechSupported

import { useCallback, useEffect, useRef, useState } from "react";

// Chromium exposes this under the webkit prefix. Electron inherits it.
type SpeechRecognitionInstance = InstanceType<typeof webkitSpeechRecognition>;

/** Whether the current runtime supports the Web Speech API. */
export function isWebSpeechSupported(): boolean {
  return typeof webkitSpeechRecognition !== "undefined";
}

export interface UseWebSpeechTranscriptionResult {
  /** Whether the Web Speech API is available in this runtime. */
  readonly isSupported: boolean;
  /** Whether the recognizer is actively listening. */
  readonly isListening: boolean;
  /** Interim (not-yet-finalized) transcript updated in real time. */
  readonly interimTranscript: string;
  /** Start listening. Resolves immediately. */
  readonly start: () => void;
  /**
   * Stop listening and return the accumulated final transcript.
   * Resolves once the recognizer has flushed its last result.
   */
  readonly stop: () => Promise<string>;
  /** Cancel without producing a transcript. */
  readonly cancel: () => void;
}

/**
 * React hook wrapping Chromium's `webkitSpeechRecognition`.
 *
 * Key design notes (from Electron-specific research):
 * - Only works in the **renderer** web context (not Node / preload).
 * - Mic permissions are already granted by Caide's `configureMediaPermissions()`.
 * - The API silently ends after ~60s of silence; we auto-restart while intended.
 * - Requires internet — a `"network"` error is surfaced as a rejection.
 * - `lang` defaults to the user's browser locale.
 */
export function useWebSpeechTranscription(): UseWebSpeechTranscriptionResult {
  const supported = isWebSpeechSupported();
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  // Mutable refs so callbacks inside the recognition instance can read current state
  // without re-binding event handlers.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const intentionallyListeningRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const stopResolverRef = useRef<((transcript: string) => void) | null>(null);

  const teardown = useCallback(() => {
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
    }
    setIsListening(false);
    setInterimTranscript("");

    // If a stop() promise is pending, resolve it with whatever we accumulated.
    const resolver = stopResolverRef.current;
    if (resolver) {
      stopResolverRef.current = null;
      resolver(finalTranscriptRef.current.trim());
    }
  }, []);

  // Clean up on unmount.
  useEffect(() => teardown, [teardown]);

  const start = useCallback(() => {
    if (!supported) return;
    // Tear down any existing session first.
    teardown();

    if (!navigator.onLine) {
      throw new Error("Web Speech API requires an internet connection.");
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    // Use a short maxAlternatives for speed — we only need the top result.
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    finalTranscriptRef.current = "";
    intentionallyListeningRef.current = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let sessionFinal = "";
      let sessionInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;
        const transcript = result[0].transcript;
        if (result.isFinal) {
          sessionFinal += transcript;
        } else {
          sessionInterim += transcript;
        }
      }

      finalTranscriptRef.current = sessionFinal;
      setInterimTranscript(sessionInterim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const error = event.error;
      // "aborted" fires when we call .abort() ourselves — not a real error.
      if (error === "aborted") return;

      // "no-speech" fires after silence — the onend handler will auto-restart.
      if (error === "no-speech") return;

      // Real errors: network failure, not-allowed, etc.
      intentionallyListeningRef.current = false;
      const resolver = stopResolverRef.current;
      if (resolver) {
        stopResolverRef.current = null;
        // Still resolve with whatever partial transcript we have rather than rejecting,
        // so the caller can decide what to do with partial results.
        resolver(finalTranscriptRef.current.trim());
      }
      teardown();
    };

    // The Web Speech API has a habit of ending sessions after silence or ~60s.
    // Auto-restart if the user is still intended to be recording.
    recognition.onend = () => {
      if (intentionallyListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // If restart fails, finalize.
          teardown();
        }
        return;
      }

      // Intentional stop — resolve any pending promise.
      setIsListening(false);
      const resolver = stopResolverRef.current;
      if (resolver) {
        stopResolverRef.current = null;
        resolver(finalTranscriptRef.current.trim());
      }
    };

    recognition.start();
    setIsListening(true);
  }, [supported, teardown]);

  const stop = useCallback((): Promise<string> => {
    if (!recognitionRef.current || !intentionallyListeningRef.current) {
      return Promise.resolve(finalTranscriptRef.current.trim());
    }

    intentionallyListeningRef.current = false;

    return new Promise<string>((resolve) => {
      stopResolverRef.current = resolve;
      try {
        // .stop() triggers one final onresult with isFinal=true, then onend.
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
        resolve(finalTranscriptRef.current.trim());
        stopResolverRef.current = null;
        teardown();
      }
    });
  }, [teardown]);

  const cancel = useCallback(() => {
    finalTranscriptRef.current = "";
    teardown();
  }, [teardown]);

  return {
    isSupported: supported,
    isListening,
    interimTranscript,
    start,
    stop,
    cancel,
  };
}
