// FILE: tsdown.config.ts
// Purpose: Builds the Flutter Builder engine CLI (stdio JSON-RPC server).
// Layer: Engine build config
// Depends on: tsdown.

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/embedded.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  // The embedded runtime is loaded from the server process and must not rely
  // on a second engine node_modules tree. Keep only native addons external;
  // they are shipped by the server/desktop package itself.
  external: ["better-sqlite3", "node-pty"],
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node\nimport { fileURLToPath as __cFL } from \"node:url\";\nimport * as __cDP from \"node:path\";\nconst __filename = __cFL(import.meta.url);\nconst __dirname = __cDP.dirname(__filename);\n",
  },
});
