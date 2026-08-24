import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/embedded.ts"],
  format: ["esm"],
  outDir: "dist-single",
  clean: true,
  external: ["better-sqlite3", "node-pty"],
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node\n" },
});
