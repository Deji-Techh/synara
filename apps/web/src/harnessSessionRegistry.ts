// FILE: harnessSessionRegistry.ts
// Purpose: Thread-scoped harness socket handles for send-path diversion:
// the session host registers the live handle; the slash handler looks it up
// at send time. No React state — event-time lookup only.

export interface HarnessSessionHandle {
  send: (message: Record<string, unknown>) => void;
  disconnect: () => void;
  connected: () => boolean;
  appPath: string;
  framework?: "blank" | "react-native" | "flutter" | "website";
}

const handles = new Map<string, HarnessSessionHandle>();

export function registerHarnessSession(threadId: string, handle: HarnessSessionHandle): void {
  handles.set(threadId, handle);
}

export function unregisterHarnessSession(threadId: string): void {
  handles.delete(threadId);
}

export function getHarnessSession(threadId: string): HarnessSessionHandle | undefined {
  return handles.get(threadId);
}

export function getAllHarnessSessions(): Array<{ threadId: string; handle: HarnessSessionHandle }> {
  return Array.from(handles.entries()).map(([threadId, handle]) => ({ threadId, handle }));
}
