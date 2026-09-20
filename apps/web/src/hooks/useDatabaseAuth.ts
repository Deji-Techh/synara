// FILE: useDatabaseAuth.ts
// Purpose: Check status and provide 1-click connect/disconnect for Neon and Supabase OAuth.

import { useCallback, useEffect, useState } from "react";
import { ensureNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

export function useDatabaseAuth() {
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [neonConnected, setNeonConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const [sb, ne] = await Promise.all([
        ensureNativeApi().database.invoke({ threadId: "__global__", channel: "supabase:status" }),
        ensureNativeApi().database.invoke({ threadId: "__global__", channel: "neon:status" }),
      ]);
      setSupabaseConnected(Boolean((sb.value as { connected?: boolean })?.connected));
      setNeonConnected(Boolean((ne.value as { connected?: boolean })?.connected));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
    const onAuthChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.provider === "supabase" || detail.provider === "neon") {
        void checkStatus();
      }
    };
    window.addEventListener("caide:provider-auth-changed", onAuthChanged);
    return () => {
      window.removeEventListener("caide:provider-auth-changed", onAuthChanged);
    };
  }, [checkStatus]);

  const connectSupabase = () => {
    const url = "https://supabase-oauth.dyad.sh/api/connect-supabase/login";
    if (window.desktopBridge?.openExternal) {
      void window.desktopBridge.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    toastManager.add({
      type: "info",
      title: "Authorizing with Supabase…",
      description: "Complete sign-in in your browser.",
    });
  };

  const disconnectSupabase = async () => {
    try {
      await ensureNativeApi().database.invoke({ threadId: "__global__", channel: "supabase:disconnect" });
      setSupabaseConnected(false);
      toastManager.add({ type: "success", title: "Disconnected from Supabase" });
      window.dispatchEvent(new CustomEvent("caide:provider-auth-changed", { detail: { provider: "supabase" } }));
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to disconnect from Supabase",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const connectNeon = () => {
    const url = "https://oauth.dyad.sh/api/integrations/neon/login";
    if (window.desktopBridge?.openExternal) {
      void window.desktopBridge.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    toastManager.add({
      type: "info",
      title: "Authorizing with Neon…",
      description: "Complete sign-in in your browser.",
    });
  };

  const disconnectNeon = async () => {
    try {
      await ensureNativeApi().database.invoke({ threadId: "__global__", channel: "neon:disconnect" });
      setNeonConnected(false);
      toastManager.add({ type: "success", title: "Disconnected from Neon" });
      window.dispatchEvent(new CustomEvent("caide:provider-auth-changed", { detail: { provider: "neon" } }));
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to disconnect from Neon",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    supabaseConnected,
    neonConnected,
    loading,
    connectSupabase,
    disconnectSupabase,
    connectNeon,
    disconnectNeon,
    refresh: checkStatus,
  };
}
