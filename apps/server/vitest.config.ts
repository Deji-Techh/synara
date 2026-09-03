import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Server integration tests exercise sqlite/git orchestration and can
      // legitimately exceed the default timeout when the full workspace suite
      // is running under CI load.
      testTimeout: 90_000,
      hookTimeout: 90_000,
      // Template sources copied verbatim for scaffolding carry their own
      // tests + node_modules expectations — never run them in our suite.
      exclude: [
        ...(baseConfig.test?.exclude ?? []),
        "src/dyad/scaffolds/web3-template/**",
        "src/dyad/scaffolds/api-template/**",
      ],
    },
  }),
);
