// FILE: wsRpc.handlerCoverage.test.ts
// Purpose: Regression guard against startup crashes from handler keys that
// have no registered request in AdmittedWsFeatureRpcGroup. RpcGroup.toHandlers
// builds its map via Object.entries(handlers) and throws on any key missing
// from the group's request map — which killed the server child during startup
// when `database.invoke` was spread into the handlers layer while its Rpc
// definition had never been added to a served group.
import { describe, expect, it } from "vitest";

import {
  ARTIFACTS_WS_METHODS,
  DATABASE_WS_METHODS,
  DEVICE_WS_METHODS,
  GOALS_WS_METHODS,
  ORCHESTRATION_WS_METHODS,
  PREVIEW_WS_METHODS,
  SUBAGENTS_WS_METHODS,
  WS_METHODS,
} from "@caide/contracts";

import { AdmittedWsFeatureRpcGroup } from "./wsRpc";

// Every method table whose constants appear as handler keys (directly in
// wsRpc.ts or spread in from provider/ws*Handlers.ts). A new handler source
// module must add its table here AND register its rpcs in a served group.
const HANDLER_METHOD_TABLES = [
  ["WS_METHODS", WS_METHODS],
  ["ORCHESTRATION_WS_METHODS", ORCHESTRATION_WS_METHODS],
  ["DEVICE_WS_METHODS", DEVICE_WS_METHODS],
  ["PREVIEW_WS_METHODS", PREVIEW_WS_METHODS],
  ["ARTIFACTS_WS_METHODS", ARTIFACTS_WS_METHODS],
  ["GOALS_WS_METHODS", GOALS_WS_METHODS],
  ["SUBAGENTS_WS_METHODS", SUBAGENTS_WS_METHODS],
  ["DATABASE_WS_METHODS", DATABASE_WS_METHODS],
] as const;

describe("AdmittedWsFeatureRpcGroup handler coverage", () => {
  it("registers every servable method constant so toHandlers cannot die on an unknown tag", () => {
    const failures: string[] = [];
    for (const [tableName, table] of HANDLER_METHOD_TABLES) {
      for (const [key, method] of Object.entries(table)) {
        if (!AdmittedWsFeatureRpcGroup.requests.has(method)) {
          failures.push(`${tableName}.${key} ("${method}")`);
        }
      }
    }
    expect(
      failures,
      `handler methods missing from the admitted feature group (RpcGroup.toHandlers would crash at startup): ${failures.join(", ")}`,
    ).toEqual([]);
  });
});
