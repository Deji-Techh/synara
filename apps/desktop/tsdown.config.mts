// Simplified Electron build config
import { defineConfig } from "tsdown";

export default defineConfig([
  {
    format: "cjs",
    outDir: "dist-electron",
    entry: ["src/main.ts"],
    external: ["original-fs", "electron"],
    outExtensions: () => ({ js: ".js" }),
  },
]);
