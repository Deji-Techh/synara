// FILE: tunnel.test.ts
// Purpose: Tunnel client offline behavior (id hashing, no-preview guard,
// status/stop no-ops). Live relay paths need a control plane + dev server.

import { describe, expect, it } from "vitest";
import {
  getTunnelPreviewStatus,
  relayAppIdForThread,
  startTunnelPreview,
  stopTunnelPreview,
  TunnelPreviewError,
} from "./tunnel.ts";

describe("tunnel preview client (offline)", () => {
  it("hashes thread ids to stable positive-int relay app ids", () => {
    const a = relayAppIdForThread("thread-abc");
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(2_147_483_647);
    expect(relayAppIdForThread("thread-abc")).toBe(a);
    expect(relayAppIdForThread("thread-abd")).not.toBe(a);
  });

  it("reports no tunnel and stops unknown threads cleanly", () => {
    expect(getTunnelPreviewStatus("no-such-thread")).toBeNull();
    return expect(stopTunnelPreview("no-such-thread")).resolves.toBeUndefined();
  });

  it("refuses to start without a live preview", async () => {
    await expect(startTunnelPreview("no-live-preview-thread")).rejects.toBeInstanceOf(
      TunnelPreviewError,
    );
    await expect(startTunnelPreview("no-live-preview-thread")).rejects.toThrow(
      /open_preview first/,
    );
  });
});
