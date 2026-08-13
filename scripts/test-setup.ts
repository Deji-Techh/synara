// scripts/test-setup.ts
// Polyfills memory-backed localStorage/sessionStorage for Vitest runners in Node environments

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const memoryLocalStorage = createMemoryStorage();
const memorySessionStorage = createMemoryStorage();

try {
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryLocalStorage,
    configurable: true,
    writable: true,
  });
} catch {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryLocalStorage;
}

try {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: memorySessionStorage,
    configurable: true,
    writable: true,
  });
} catch {
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = memorySessionStorage;
}

if (typeof (globalThis as unknown as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
}
