import { assert, describe, expect, it } from "vitest";

import { ThreadId } from "@caide/contracts";
import { Effect, Exit } from "effect";

import { WsRpcError } from "@caide/contracts";
import type { EngineAdapterShape } from "./Services/EngineAdapter.ts";
import type { ProviderAdapterRegistryShape } from "./Services/ProviderAdapterRegistry.ts";
import { makeWsDatabaseHandlers } from "./wsDatabaseHandlers.ts";

const threadA = ThreadId.makeUnsafe("thread-a");
const threadB = ThreadId.makeUnsafe("thread-b");

function registry(engine: Partial<EngineAdapterShape>): ProviderAdapterRegistryShape {
  return {
    getByProvider: () => Effect.succeed(engine as EngineAdapterShape),
    listProviders: () => Effect.succeed(["engine"]),
  };
}

function handlersFor(workspaces: Record<string, string>, engine: Partial<EngineAdapterShape>) {
  return makeWsDatabaseHandlers(registry(engine), {
    ensureEngineSession: () => Effect.void,
    resolveProjectWorkspace: (threadId) => Effect.succeed(workspaces[String(threadId)] ?? null),
  });
}

describe("database right-dock project isolation", () => {
  it("returns only the engine app owned by the requesting project", async () => {
    const seen: unknown[] = [];
    const engine: Partial<EngineAdapterShape> = {
      databaseInvoke: (input) => {
        seen.push(input);
        return Effect.succeed({
          value: {
            apps: [
              { id: 11, resolvedPath: "/work/project-a", name: "A" },
              { id: 22, resolvedPath: "/work/project-b", name: "B" },
            ],
          },
        });
      },
    };
    const handlers = handlersFor(
      { [String(threadA)]: "/work/project-a", [String(threadB)]: "/work/project-b" },
      engine,
    );

    const a = await Effect.runPromise(
      handlers["database.invoke"]({ threadId: threadA, channel: "list-apps" }),
    );
    const b = await Effect.runPromise(
      handlers["database.invoke"]({ threadId: threadB, channel: "list-apps" }),
    );
    expect(a.value).toEqual({ apps: [{ id: 11, resolvedPath: "/work/project-a", name: "A" }] });
    expect(b.value).toEqual({ apps: [{ id: 22, resolvedPath: "/work/project-b", name: "B" }] });
    expect(seen).toHaveLength(2);
  });

  it("rejects a database mutation that names another project's app", async () => {
    const engine: Partial<EngineAdapterShape> = {
      databaseInvoke: () => Effect.succeed({ value: { apps: [{ id: 11, resolvedPath: "/work/a" }] } }),
    };
    const handlers = handlersFor({ [String(threadA)]: "/work/a" }, engine);
    const exit = await Effect.runPromise(
      Effect.exit(
        handlers["database.invoke"]({
          threadId: threadA,
          channel: "neon:set-app-project",
          payload: { appId: 22, projectId: "foreign" },
        }),
      ),
    );
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      if (reason?._tag === "Fail") {
        expect(reason.error).toBeInstanceOf(WsRpcError);
        expect((reason.error as WsRpcError).message).toContain("does not belong");
      }
    }
  });
});
