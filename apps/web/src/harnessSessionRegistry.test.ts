// FILE: harnessSessionRegistry.test.ts
// Purpose: Registry put/get/drop semantics for send-path diversion.

import { describe, expect, it } from "vitest";
import {
  getHarnessSession,
  registerHarnessSession,
  unregisterHarnessSession,
} from "./harnessSessionRegistry";

describe("harnessSessionRegistry", () => {
  it("registers, resolves, and unregisters thread handles", () => {
    expect(getHarnessSession("t-missing")).toBeUndefined();
    const handle = {
      send: () => {},
      disconnect: () => {},
      connected: () => true,
      appPath: "/tmp/x",
      framework: "website" as const,
    };
    registerHarnessSession("t-1", handle);
    expect(getHarnessSession("t-1")?.appPath).toBe("/tmp/x");
    unregisterHarnessSession("t-1");
    expect(getHarnessSession("t-1")).toBeUndefined();
  });
});
