// FILE: tsdown.config.ts
// Purpose: Builds the Flutter Builder engine CLI (stdio JSON-RPC server).
// Layer: Engine build config
// Depends on: tsdown.

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  // `pg-schema-classifier` is a private, TS-source-only workspace package
  // (main: ./src/index.ts). Bundling it avoids shipping/  resolving a .ts file
  // at runtime in the packaged desktop app, where the engine runs from an
  // unpacked self-contained directory with no workspace symlink.
  noExternal: (id) => id.startsWith("@caide/") || id === "pg-schema-classifier",
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
