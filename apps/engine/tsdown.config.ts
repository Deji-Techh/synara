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
  noExternal: (id) => id.startsWith("@caide/"),
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
