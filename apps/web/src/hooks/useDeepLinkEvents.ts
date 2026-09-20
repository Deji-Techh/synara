// FILE: useDeepLinkEvents.ts
// Purpose: Listen for OS deep links (caide:// and dyad:// protocols) via DesktopBridge
// and handle OAuth returns (Supabase, Neon).

import { useEffect } from "react";
import type { ThreadId } from "@caide/contracts";
import { ensureNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

export interface DeepLinkRouteEvent {
  type: string;
  query?: Record<string, string>;
  payload?: Record<string, unknown>;
  token?: string;
  raw?: string;
}

export function useDeepLinkEvents(): void {
  useEffect(() => {
    if (!window.desktopBridge?.onDeepLink) return;

    const unsubscribe = window.desktopBridge.onDeepLink(async (routeUnknown) => {
      const route = routeUnknown as DeepLinkRouteEvent;
      if (!route || typeof route !== "object") return;

      if (route.type === "supabase-oauth-return") {
        const token = route.query?.token || route.query?.access_token || "";
        if (!token) {
          toastManager.add({
            type: "error",
            title: "Supabase connection failed",
            description: "No access token received from authentication.",
          });
          return;
        }
        try {
          await ensureNativeApi().database.invoke({
            threadId: "__global__" as ThreadId,
            channel: "supabase:oauth-return",
            payload: { token },
          });
          toastManager.add({
            type: "success",
            title: "Connected to Supabase",
            description: "Your Supabase account is now linked.",
          });
          window.dispatchEvent(
            new CustomEvent("caide:provider-auth-changed", { detail: { provider: "supabase" } }),
          );
        } catch (cause) {
          toastManager.add({
            type: "error",
            title: "Failed to save Supabase connection",
            description: cause instanceof Error ? cause.message : String(cause),
          });
        }
      } else if (route.type === "neon-oauth-return") {
        const token = route.query?.token || route.query?.access_token || "";
        if (!token) {
          toastManager.add({
            type: "error",
            title: "Neon connection failed",
            description: "No API key received from authentication.",
          });
          return;
        }
        try {
          await ensureNativeApi().database.invoke({
            threadId: "__global__" as ThreadId,
            channel: "neon:oauth-return",
            payload: { token },
          });
          toastManager.add({
            type: "success",
            title: "Connected to Neon",
            description: "Your Neon account is now linked.",
          });
          window.dispatchEvent(
            new CustomEvent("caide:provider-auth-changed", { detail: { provider: "neon" } }),
          );
        } catch (cause) {
          toastManager.add({
            type: "error",
            title: "Failed to save Neon connection",
            description: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
