// FILE: useGithubAuth.ts
// Purpose: GitHub Device Flow authentication state and actions.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadId } from "@caide/contracts";
import { ensureNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

export interface GithubUser {
  login: string;
  name: string;
  avatarUrl: string;
  htmlUrl: string;
}

export interface GithubDeviceFlowState {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export function useGithubAuth() {
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceFlow, setDeviceFlow] = useState<GithubDeviceFlowState | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollAbortRef = useRef<boolean>(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await ensureNativeApi().database.invoke({
        threadId: "__global__" as ThreadId,
        channel: "github:auth-status",
      });
      const data = res.value as { connected: boolean; user: GithubUser | null };
      setConnected(Boolean(data?.connected));
      setUser(data?.user ?? null);
    } catch {
      setConnected(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    const onAuthChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.provider === "github") {
        void checkStatus();
      }
    };
    window.addEventListener("caide:provider-auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("caide:provider-auth-changed", onAuthChanged);
      pollAbortRef.current = true;
    };
  }, [checkStatus]);

  const startDeviceFlow = async () => {
    setError(null);
    try {
      const res = await ensureNativeApi().database.invoke({
        threadId: "__global__" as ThreadId,
        channel: "github:device-code-request",
      });
      const data = res.value as {
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        expiresIn: number;
        interval?: number;
      };
      setDeviceFlow({
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        expiresIn: data.expiresIn,
      });
      setPolling(true);
      pollAbortRef.current = false;

      // Start polling backend
      void (async () => {
        try {
          const pollRes = await ensureNativeApi().database.invoke({
            threadId: "__global__" as ThreadId,
            channel: "github:device-code-poll",
            payload: {
              deviceCode: data.deviceCode,
              interval: data.interval,
              expiresIn: data.expiresIn,
            },
          });
          if (pollAbortRef.current) return;
          const pollData = pollRes.value as { ok: boolean };
          if (pollData.ok) {
            toastManager.add({ type: "success", title: "Connected to GitHub" });
            setDeviceFlow(null);
            setPolling(false);
            await checkStatus();
            window.dispatchEvent(
              new CustomEvent("caide:provider-auth-changed", { detail: { provider: "github" } }),
            );
          }
        } catch (err) {
          if (pollAbortRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setPolling(false);
          setDeviceFlow(null);
        }
      })();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancelDeviceFlow = () => {
    pollAbortRef.current = true;
    setDeviceFlow(null);
    setPolling(false);
  };

  const disconnect = async () => {
    try {
      await ensureNativeApi().database.invoke({
        threadId: "__global__" as ThreadId,
        channel: "github:disconnect",
      });
      setConnected(false);
      setUser(null);
      toastManager.add({ type: "success", title: "Disconnected from GitHub" });
      window.dispatchEvent(
        new CustomEvent("caide:provider-auth-changed", { detail: { provider: "github" } }),
      );
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to disconnect from GitHub",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    connected,
    user,
    loading,
    deviceFlow,
    polling,
    error,
    startDeviceFlow,
    cancelDeviceFlow,
    disconnect,
    refresh: checkStatus,
  };
}
