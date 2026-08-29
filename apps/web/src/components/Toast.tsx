// apps/web/src/components/Toast.tsx — M51: Real notification system
// toastManager for build/preview/rate-limit/provider errors

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; message: string; kind: ToastKind; visible: boolean }

let toastId = 0;
let currentToast: Toast | null = null;
let listeners = new Set<() => void>();

export function showToast(message: string, kind: ToastKind = "info") {
  currentToast = { id: ++toastId, message, kind, visible: true };
  listeners.forEach((fn) => fn());
  setTimeout(() => { if (currentToast && currentToast.id === toastId) { currentToast.visible = false; listeners.forEach((fn) => fn()); } }, kind === "error" ? 10000 : 5000);
}

export function useToast() {
  const [, forceRender] = React.useState(0);
  React.useEffect(() => {
    const unsub = () => { forceRender((n) => n + 1); };
    listeners.add(unsub);
    return () => listeners.delete(unsub);
  }, []);
  return currentToast;
}

import React from "react";

export function ToastContainer() {
  const toast = useToast();
  if (!toast?.visible) return null;
  const colors: Record<ToastKind, string> = {
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    error: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
    info: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-2 shadow-lg text-sm animate-in fade-in slide-in-from-bottom-2" style={{ background: "var(--card)" }}>
      <span className={colors[toast.kind]}>{toast.message}</span>
    </div>
  );
}
