// FILE: src/client.test.ts
// Purpose: Verifies the EngineClient speaks to a spawned engine process and
// surfaces protocol errors correctly.
// Layer: Engine protocol client test

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EngineClient, EngineRequestError } from "./client.ts";

const engineEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

async function openClient(): Promise<EngineClient> {
  const client = new EngineClient({
    command: "bun",
    args: ["run", engineEntry],
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
