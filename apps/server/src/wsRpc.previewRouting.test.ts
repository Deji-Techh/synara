// FILE: wsRpc.previewRouting.test.ts
// Purpose: Regression guard for preview.* WS routing. RpcServer routes by the
// group's request map (RpcServer.js: `group.requests.get(request.tag)`), so any
// method served by a handler but absent from the admitted group silently 404s
// over the socket as "Unknown request tag". The preview group was defined in
// contracts but never merged into the admitted group — every preview.* call
// died before reaching its handler.
import { describe, expect, it } from "vitest";

import { PREVIEW_WS_METHODS } from "@caide/contracts";

import { hasAdmittedWsFeatureRequest } from "./wsRpc";

describe("AdmittedWsFeatureRpcGroup preview routing", () => {
  it("routes every preview method through the admitted feature group", () => {
    for (const method of Object.values(PREVIEW_WS_METHODS)) {
      expect(
        hasAdmittedWsFeatureRequest(method),
        `${method} must be in the admitted feature group`,
      ).toBe(true);
    }
  });
});
