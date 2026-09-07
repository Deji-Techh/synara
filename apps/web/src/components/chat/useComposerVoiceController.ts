// FILE: useComposerVoiceController.ts
// Purpose: Own the composer voice-note state machine for recording, cancellation, and transcription.
//          Supports two transcription backends: server-side AI model or Chromium's Web Speech API.
// Layer: Chat composer hook
// Depends on: useVoiceRecorder, useWebSpeechTranscription, ChatView voice helper logic, native API.

import { type ProviderKind, type ServerProviderStatus, type ThreadId } from "@caide/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Project } from "../../types";
import {
  formatVoiceRecordingDuration,
  isVoiceRecordingCancelledError,
  useVoiceRecorder,
} from "../../lib/voiceRecorder";
import { useWebSpeechTranscription } from "../../lib/useWebSpeechTranscription";
import { readNativeApi } from "../../nativeApi";
import type { RefreshProviderStatusesNow } from "../../hooks/useProviderStatusRefresh";
import { toastManager } from "../ui/toast";
import {
  deriveComposerVoiceState,
  describeVoiceRecordingStartError,
  isVoiceAuthExpiredMessage,
  sanitizeVoiceErrorMessage,
} from "../ChatView.logic";

export interface ComposerVoiceFailureCopy {
  transcriptionFailedTitle: string;
  fallbackDescription: string;
  authExpiredTitle: string;
  authExpiredDescription: string;
  refreshActionLabel: string;
}

interface ComposerVoiceGuardDetails {
  readonly [key: string]: unknown;
}

export interface UseComposerVoiceControllerOptions {
  activeProject: Project | undefined;
  activeThreadId: ThreadId | null;
  threadId: ThreadId;
  selectedProvider: ProviderKind;
  activeProviderStatus: ServerProviderStatus | null;
  pendingUserInputCount: number;
  onTranscriptReady: (transcript: string) => void;
  refreshVoiceStatus: RefreshProviderStatusesNow;
  /** Which transcription backend to use: server-side AI model or Chromium Web Speech API. */
  voiceTranscriptionProvider?: "ai-model" | "web-speech";
  actionArmDelayMs?: number;
  failureCopy?: Partial<ComposerVoiceFailureCopy>;
  onGuardWarning?: (message: string, details: ComposerVoiceGuardDetails) => void;
}

export interface UseComposerVoiceControllerResult {
  isVoiceRecording: boolean;
  isVoiceTranscribing: boolean;
  voiceWaveformLevels: readonly number[];
  voiceRecordingDurationLabel: string;
  showVoiceNotesControl: boolean;
  startComposerVoiceRecording: () => Promise<void>;
  submitComposerVoiceRecording: () => Promise<void>;
  cancelComposerVoiceRecording: () => void;
}

const DEFAULT_FAILURE_COPY: ComposerVoiceFailureCopy = {
  transcriptionFailedTitle: "Voice transcription failed",
  fallbackDescription: "The voice note could not be transcribed.",
  authExpiredTitle: "Voice provider key required",
  authExpiredDescription:
    "Voice transcription requires an API key for Google Gemini, Groq, or OpenAI. Please configure one in Settings → Providers.",
  refreshActionLabel: "Refresh status",
};

// Keeps the async transcription lifecycle out of ChatView so the component can stay UI-focused.
export function useComposerVoiceController(
  options: UseComposerVoiceControllerOptions,
): UseComposerVoiceControllerResult {
  const {
    activeProject,
    activeThreadId,
    threadId,
    selectedProvider,
    activeProviderStatus,
    pendingUserInputCount,
    onTranscriptReady,
    refreshVoiceStatus,
    voiceTranscriptionProvider = "ai-model",
    actionArmDelayMs: actionArmDelayMsProp,
    failureCopy: failureCopyOverrides,
    onGuardWarning,
  } = options;
  const isWebSpeechMode = voiceTranscriptionProvider === "web-speech";
  const actionArmDelayMs = actionArmDelayMsProp ?? 0;
  const {
    isRecording: isVoiceRecording,
    durationMs: voiceRecordingDurationMs,
    waveformLevels: voiceWaveformLevels,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    cancelRecording: cancelVoiceRecording,
  } = useVoiceRecorder();
  const webSpeech = useWebSpeechTranscription();
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const voiceTranscriptionRequestIdRef = useRef(0);
  const voiceThreadIdRef = useRef(threadId);
  const voiceProviderRef = useRef<ProviderKind>(selectedProvider);
  const voiceRecordingStartedAtRef = useRef<number | null>(null);
  const failureCopy = {
    ...DEFAULT_FAILURE_COPY,
    ...failureCopyOverrides,
  };
  // A transcription can resolve immediately after navigation commits, so stamp
  // its identity before passive effects and browser events can observe it.
  useLayoutEffect(() => {
    voiceThreadIdRef.current = threadId;
    voiceProviderRef.current = selectedProvider;
  }, [threadId, selectedProvider]);

  const voiceRecordingDurationLabel = formatVoiceRecordingDuration(voiceRecordingDurationMs);
  const { canStartVoiceNotes, showVoiceNotesControl } = deriveComposerVoiceState({
    authStatus: activeProviderStatus?.authStatus,
    voiceTranscriptionAvailable: activeProviderStatus?.voiceTranscriptionAvailable,
    isRecording: isVoiceRecording || webSpeech.isListening,
    isTranscribing: isVoiceTranscribing,
    voiceTranscriptionProvider,
  });

  useEffect(() => {
    const invalidatedRequestId = voiceTranscriptionRequestIdRef.current + 1;
    voiceTranscriptionRequestIdRef.current = invalidatedRequestId;
    voiceRecordingStartedAtRef.current = null;
    // The spinner reset rides the cancel promise so no state is written
    // synchronously inside the effect (keeps the hook compiler-eligible).
    void cancelVoiceRecording().finally(() => {
      if (voiceTranscriptionRequestIdRef.current === invalidatedRequestId) {
        setIsVoiceTranscribing(false);
      }
    });
  }, [cancelVoiceRecording, selectedProvider, threadId]);

  useEffect(
    () => () => {
      voiceTranscriptionRequestIdRef.current += 1;
      voiceRecordingStartedAtRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (canStartVoiceNotes || !isVoiceRecording) {
      return;
    }
    onGuardWarning?.("cancelled active voice recording because voice became unavailable", {
      authStatus: activeProviderStatus?.authStatus ?? null,
      voiceTranscriptionAvailable: activeProviderStatus?.voiceTranscriptionAvailable ?? null,
      isVoiceRecording,
    });
    const invalidatedRequestId = voiceTranscriptionRequestIdRef.current + 1;
    voiceTranscriptionRequestIdRef.current = invalidatedRequestId;
    voiceRecordingStartedAtRef.current = null;
    void cancelVoiceRecording().finally(() => {
      if (voiceTranscriptionRequestIdRef.current === invalidatedRequestId) {
        setIsVoiceTranscribing(false);
      }
    });
  }, [
    activeProviderStatus?.authStatus,
    activeProviderStatus?.voiceTranscriptionAvailable,
    canStartVoiceNotes,
    cancelVoiceRecording,
    isVoiceRecording,
    onGuardWarning,
  ]);

  const isVoiceActionArmed = () => {
    if (actionArmDelayMs <= 0 || voiceRecordingStartedAtRef.current === null) {
      return true;
    }
    const recordedForMs = Math.round(performance.now() - voiceRecordingStartedAtRef.current);
    if (recordedForMs < 0 || recordedForMs >= actionArmDelayMs) {
      return true;
    }
    onGuardWarning?.("ignored recorder action immediately after start", {
      recordedForMs,
    });
    return false;
  };

  const startComposerVoiceRecording = async () => {
    if (!isWebSpeechMode && activeProviderStatus?.authStatus === "unauthenticated") {
      toastManager.add({
        type: "error",
        title: "Please configure a voice-compatible model (Google Gemini, Groq, or OpenAI) in Settings.",
      });
      return;
    }
    if (!canStartVoiceNotes) {
      toastManager.add({
        type: "error",
        title: isWebSpeechMode
          ? "Web Speech API is not available in this browser."
          : "Voice notes require an API key for Google Gemini, Groq, or OpenAI.",
      });
      return;
    }
    if (pendingUserInputCount > 0) {
      toastManager.add({
        type: "error",
        title: "Answer plan questions before recording a voice note.",
      });
      return;
    }

    if (isWebSpeechMode) {
      // Web Speech mode: start the browser's built-in speech recognizer.
      // Also start the audio recorder in parallel purely for waveform visualization.
      try {
        webSpeech.start();
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not start voice recognition",
          description:
            error instanceof Error ? error.message : "Web Speech API failed to initialize.",
        });
        return;
      }
      try {
        await startVoiceRecording();
      } catch {
        // Waveform recording is optional — web speech still works without it.
      }
      voiceRecordingStartedAtRef.current = performance.now();
      return;
    }

    // AI model mode: existing behavior — record audio, prewarm server.
    const effectiveCwd = activeProject?.cwd ?? "";
    try {
      await startVoiceRecording();
      voiceRecordingStartedAtRef.current = performance.now();
      const api = readNativeApi();
      void api?.server
        .prewarmVoice?.({
          provider: selectedProvider,
          cwd: effectiveCwd,
          ...(activeThreadId ? { threadId: activeThreadId } : {}),
        })
        .catch(() => undefined);
    } catch (error) {
      if (isVoiceRecordingCancelledError(error)) {
        return;
      }
      toastManager.add({
        type: "error",
        title: "Could not start recording",
        description: describeVoiceRecordingStartError(error),
      });
    }
  };

  const submitComposerVoiceRecording = (): Promise<void> => {
    const isActiveRecording = isWebSpeechMode
      ? webSpeech.isListening
      : isVoiceRecording;
    if (!isActiveRecording) {
      return Promise.resolve();
    }
    if (!isVoiceActionArmed()) {
      return Promise.resolve();
    }

    if (isWebSpeechMode) {
      // Web Speech mode: stop the recognizer and read the accumulated transcript.
      setIsVoiceTranscribing(true);
      // Stop the waveform recorder (best-effort).
      void cancelVoiceRecording();

      return webSpeech
        .stop()
        .then((transcript) => {
          voiceRecordingStartedAtRef.current = null;
          setIsVoiceTranscribing(false);
          if (!transcript.trim()) {
            toastManager.add({
              type: "warning",
              title: "No speech detected",
              description: "No words were recognized. Try speaking louder or check your microphone.",
            });
            return;
          }
          onTranscriptReady(transcript);
        })
        .catch(() => {
          voiceRecordingStartedAtRef.current = null;
          setIsVoiceTranscribing(false);
          toastManager.add({
            type: "error",
            title: "Voice transcription failed",
            description: "Web Speech API encountered an error.",
          });
        });
    }

    // AI model mode: existing server transcription pipeline.
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Voice transcription is unavailable right now.",
      });
      void cancelVoiceRecording();
      return Promise.resolve();
    }

    setIsVoiceTranscribing(true);
    const requestId = voiceTranscriptionRequestIdRef.current + 1;
    voiceTranscriptionRequestIdRef.current = requestId;
    const requestThreadId = threadId;
    const requestProvider = selectedProvider;
    const isCurrentVoiceRequest = () =>
      voiceTranscriptionRequestIdRef.current === requestId &&
      voiceThreadIdRef.current === requestThreadId &&
      voiceProviderRef.current === requestProvider;

    // Promise chain instead of async/try-catch-finally: React Compiler does
    // not yet support try/finally, and it would skip optimizing this hook.
    return stopVoiceRecording()
      .then((payload) => {
        if (!isCurrentVoiceRequest()) {
          return;
        }
        if (!payload) {
          toastManager.add({
            type: "warning",
            title: "No audio was captured.",
          });
          return;
        }
        return api.server
          .transcribeVoice({
            provider: selectedProvider,
            cwd: activeProject?.cwd ?? "",
            ...(activeThreadId ? { threadId: activeThreadId } : {}),
            ...payload,
          })
          .then((result) => {
            if (!isCurrentVoiceRequest()) {
              return;
            }
            if (!result || !result.text?.trim()) {
              toastManager.add({
                type: "warning",
                title: "No speech detected",
                description: "Audio recording was empty or could not be transcribed.",
              });
              return;
            }
            onTranscriptReady(result.text);
          });
      })
      .catch((error: unknown) => {
        if (!isCurrentVoiceRequest()) {
          return;
        }

        const description =
          error instanceof Error
            ? sanitizeVoiceErrorMessage(error.message)
            : failureCopy.fallbackDescription;
        const authExpired = isVoiceAuthExpiredMessage(description);
        if (authExpired) {
          void refreshVoiceStatus();
        }
        toastManager.add({
          type: "error",
          title: authExpired ? failureCopy.authExpiredTitle : failureCopy.transcriptionFailedTitle,
          description: authExpired ? failureCopy.authExpiredDescription : description,
          ...(authExpired
            ? {
                actionProps: {
                  children: failureCopy.refreshActionLabel,
                  onClick: () => {
                    void refreshVoiceStatus();
                  },
                },
              }
            : {}),
        });
      })
      .finally(() => {
        if (isCurrentVoiceRequest()) {
          voiceRecordingStartedAtRef.current = null;
          setIsVoiceTranscribing(false);
        }
      })
      .then(() => undefined);
  };

  const cancelComposerVoiceRecording = () => {
    if (!isVoiceActionArmed()) {
      return;
    }
    voiceTranscriptionRequestIdRef.current += 1;
    voiceRecordingStartedAtRef.current = null;
    setIsVoiceTranscribing(false);
    void cancelVoiceRecording();
    if (isWebSpeechMode) {
      webSpeech.cancel();
    }
  };

  return {
    isVoiceRecording: isVoiceRecording || webSpeech.isListening,
    isVoiceTranscribing,
    voiceWaveformLevels,
    voiceRecordingDurationLabel,
    showVoiceNotesControl,
    startComposerVoiceRecording,
    submitComposerVoiceRecording,
    cancelComposerVoiceRecording,
  };
}
