import { describe, expect, it } from "vitest";
import { registerSidebarHandlers } from "./sidebar_handlers";
import { getRegisteredHandlerForTesting } from "./base";
import { ActiveSubagentSchema } from "../types/sidebar";

describe("sidebar getActiveSubagents handler", () => {
  it("returns an empty array when no subagents are registered", async () => {
    registerSidebarHandlers();
    const handler = getRegisteredHandlerForTesting(
      "sidebar:getActiveSubagents",
    );
    const globalStore = (globalThis as any).__caideActiveSubagents;
    (globalThis as any).__caideActiveSubagents = undefined;
    try {
      const result = await handler({} as any, { appId: 1 });
      expect(result).toEqual([]);
    } finally {
      (globalThis as any).__caideActiveSubagents = globalStore;
    }
  });

  it("converts the Map store into an array conforming to ActiveSubagentSchema", async () => {
    const handler = getRegisteredHandlerForTesting(
      "sidebar:getActiveSubagents",
    );
    const globalStore = (globalThis as any).__caideActiveSubagents;
    (globalThis as any).__caideActiveSubagents = new Map([
      [
        "id-1",
        {
          id: "id-1",
          name: "Subagent Task",
          description: "desc",
          startedAt: 123,
        },
      ],
      [
        "id-2",
        {
          id: "id-2",
          name: "Subagent Task",
          description: "desc2",
          startedAt: 456,
        },
      ],
    ]);
    try {
      const result = (await handler({} as any, { appId: 1 })) as Array<{
        id: string;
        name: string;
        description: string;
        startedAt: number;
      }>;
      expect(result).toEqual([
        {
          id: "id-1",
          name: "Subagent Task",
          description: "desc",
          startedAt: 123,
        },
        {
          id: "id-2",
          name: "Subagent Task",
          description: "desc2",
          startedAt: 456,
        },
      ]);
      for (const item of result) {
        expect(ActiveSubagentSchema.safeParse(item).success).toBe(true);
      }
    } finally {
      (globalThis as any).__caideActiveSubagents = globalStore;
    }
  });
});
