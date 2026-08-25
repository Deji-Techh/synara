import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/embedded.ts"],
  format: ["esm"],
  outDir: "dist-single",
  clean: true,
  external: ["better-sqlite3", "node-pty"],
  noExternal: [/.*/],
  banner: {
    js: '#!/usr/bin/env node\nimport { fileURLToPath as __cFL } from "node:url";\nimport * as __cDP from "node:path";\nconst __filename = __cFL(import.meta.url);\nconst __dirname = __cDP.dirname(__filename);\n',
  },
});
