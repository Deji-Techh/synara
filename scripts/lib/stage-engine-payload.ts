// FILE: stage-engine-payload.ts
// Purpose: Produces the engine payload directory for desktop packaging.
// In the pure Caide harness architecture, apps/server/src/harness is the single integrated server.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ENGINE_PAYLOAD_RELATIVE_DIR = "engine-payload";

export function stageEnginePayload(
  _repoRoot: string,
  payloadParentDir: string,
  _verbose: boolean,
): { payloadDir: string } {
  const payloadDir = join(payloadParentDir, ENGINE_PAYLOAD_RELATIVE_DIR);
  mkdirSync(payloadDir, { recursive: true });
  mkdirSync(join(payloadDir, "dist"), { recursive: true });
  mkdirSync(join(payloadDir, "drizzle"), { recursive: true });
  
  writeFileSync(
    join(payloadDir, "dist", "index.mjs"),
    "// Pure Caide Harness Runtime\nexport {};\n",
  );
  writeFileSync(
    join(payloadDir, "package.json"),
    JSON.stringify(
      {
        name: "caide-engine-payload",
        private: true,
        version: "0.0.1",
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );

  return { payloadDir };
}

export function buildEngineDist(_engineDir: string, _verbose: boolean): boolean {
  return true;
}
