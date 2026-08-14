// FILE: src/streaming.test.ts
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EngineClient } from "./client.ts";
import { startFakeLlmServer, type FakeLlmServerHandle } from "./testing/fakeLlmServer.ts";
import { ENGINE_METHODS } from "./protocol.ts";

const engineEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

describe("Engine Streaming (JSON-RPC Notifications)", () => {
  let llmServer: FakeLlmServerHandle;

  beforeAll(async () => {
    llmServer = await startFakeLlmServer({});
  });

  afterAll(async () => {
    await llmServer.close();
  });

  it("emits textDelta and status notifications during a turn", async () => {
    const notifications: { method: string; params: any }[] = [];

    const client = new EngineClient({
      command: "bun",
      args: ["run", engineEntry],
      onNotification: (method, params) => {
        notifications.push({ method, params });
      },
    });

    try {
      await client.waitForSpawn();

      // "tc=build-plan" triggers a canned response from fakeLlmServer
      const response = await client.turnRun({
        message: "tc=build-plan",
        mode: "plan",
        model: {
          baseUrl: `${llmServer.url}/v1`,
          apiKey: "test-key",
          modelId: "test-model",
        },
      });

      expect(response.error).toBeUndefined();
      
      // Check the final text response
      const result = response.result as any;
      expect(result.text).toContain("flutter create");

      // Verify the notifications
      const statuses = notifications.filter((n) => n.method === ENGINE_METHODS.turnStatus);
      expect(statuses.length).toBeGreaterThanOrEqual(2);
      expect(statuses[0]?.params.status).toBe("started");
      expect(statuses[statuses.length - 1]?.params.status).toBe("completed");

      const deltas = notifications.filter((n) => n.method === ENGINE_METHODS.turnTextDelta);
      expect(deltas.length).toBeGreaterThan(0);
      
      const fullText = deltas.map((d) => d.params.delta).join("");
      expect(fullText).toBe(result.text);

    } finally {
      await client.shutdown();
    }
  }, 30_000);
});
