// apps/web/src/components/Toast.tsx — Notification system with auto-dismiss
import { useEffect, useState, useCallback } from "react";

interface Toast { id: string; message: string; type: "success" | "error" | "info"; }

let toastId = 0;
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function notify(message: string, type: Toast["type"] = "info") {
  const id = `toast-${++toastId}`;
  toasts = [...toasts, { id, message, type }];
  listeners.forEach((fn) => fn(toasts));
  // Auto-dismiss success after 5s
  if (type === "success") {
    setTimeout(() => dismiss(id), 5000);
  }
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((fn) => fn(toasts));
}

export function toast = { success: (m: string) => notify(m, "success"), error: (m: string) => notify(m, "error"), info: (m: string) => notify(m, "info"), dismiss };

export function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg ${t.type === "error" ? "border-red-500/30 bg-red-500/10 text-red-500" : t.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-card"}`}>
          <span className={`size-1.5 rounded-full ${t.type === "error" ? "bg-red-500" : t.type === "success" ? "bg-emerald-500" : "bg-blue-500"}`} />
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">×</button>
        </div>
      ))}
    </div>
  );
}
