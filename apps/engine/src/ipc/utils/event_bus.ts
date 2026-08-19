type Listener = (payload: unknown) => void;
type ChannelListener = (channel: string, payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
const wildcardListeners = new Set<ChannelListener>();

export function on(channel: string, listener: Listener): () => void {
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
  }
  listeners.get(channel)!.add(listener);
  return () => {
    listeners.get(channel)?.delete(listener);
  };
}

/**
 * Engine bridge: subscribe to every emitted event (used by the JSON-RPC
 * notification relay in index.ts).
 */
export function onAll(listener: ChannelListener): () => void {
  wildcardListeners.add(listener);
  return () => {
    wildcardListeners.delete(listener);
  };
}

export function emit(channel: string, payload: unknown): void {
  listeners.get(channel)?.forEach((fn) => fn(payload));
  wildcardListeners.forEach((fn) => fn(channel, payload));
}
