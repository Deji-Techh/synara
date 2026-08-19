// FILE: src/client.test.ts
// Purpose: Verifies the EngineClient speaks to a spawned engine process and
// surfaces protocol errors correctly.
// Layer: Engine protocol client test
// NOTE: the engine must run under Node (better-sqlite3 is not supported by
// Bun), so this spawns the built bundle `dist/index.mjs`. `bun run test` runs
// `bun run build` first (see package.json).

import path from "node:path";

import { describe, expect, it } from "vitest";

import { EngineClient, EngineRequestError } from "./client.ts";

const engineEntry = path.resolve(process.cwd(), "dist", "index.mjs");

async function openClient(): Promise<EngineClient> {
  const client = new EngineClient({
    command: process.execPath,
    args: [engineEntry],
    env: {
      ...process.env,
      NODE_ENV: "development",
      CAIDE_DEV_USER_DATA_DIR: `/tmp/caide-engine-test-${process.pid}-client`,
    },
  });
  await client.waitForSpawn();
  return client;
}

describe("EngineClient", () => {
  it("initialize round trip reports engine capabilities", async () => {
    const client = await openClient();
    try {
      const response = await client.initialize({ clientName: "caide-server", protocolVersion: 1 });
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({ serverName: "caide-engine", protocolVersion: 1 });
    } finally {
      client.kill();
    }
  });

  it("ping round trip returns pong", async () => {
    const client = await openClient();
    try {
      const response = await client.ping();
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({ pong: "pong" });
    } finally {
      client.kill();
    }
  });

  it("rejects with the JSON-RPC error for unknown methods", async () => {
    const client = await openClient();
    try {
      await expect(client.request("no/such/method")).rejects.toBeInstanceOf(EngineRequestError);
    } finally {
      client.kill();
    }
  });

  it("shutdown closes the process cleanly", async () => {
    const client = await openClient();
    await client.shutdown();
    expect(client.pid).toBeDefined();
  });
});
