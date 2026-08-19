import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    // Engine spawn tests boot the full engine (drizzle migrations + flutter
    // probe) inside a fresh process each time; give them real time.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Native modules (better-sqlite3, node-pty) and child-process spawning are
    // safest under a fork pool.
    pool: "forks",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      electron: resolve(__dirname, "./src/electron-shim.ts"),
    },
  },
});
