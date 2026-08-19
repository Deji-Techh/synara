// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import {
  defineContract,
  unwrapIpcEnvelope,
  type IpcInvokeEnvelope,
} from "../contracts/core";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, input: unknown) => unknown>(),
  sendTelemetryException: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, fn: (event: unknown, input: unknown) => unknown) => {
        mocks.handlers.set(channel, fn);
      },
    ),
  },
}));

vi.mock("../utils/telemetry", () => ({
  sendTelemetryException: mocks.sendTelemetryException,
}));

vi.mock("../utils/test_utils", () => ({
  IS_TEST_BUILD: true,
}));

const { createTypedHandler } = await import("./base");
const { createLoggedHandler } = await import("./safe_handle");

function getEnvelope(
  channel: string,
  input?: unknown,
): Promise<IpcInvokeEnvelope> {
  const handler = mocks.handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`);
  }
  return Promise.resolve(handler({ sender: {} }, input) as IpcInvokeEnvelope);
}

describe("IPC handler envelopes", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.sendTelemetryException.mockClear();
  });

  it("returns success envelopes from typed handlers", async () => {
    createTypedHandler(
      defineContract({
        channel: "ok-channel",
        input: z.object({ value: z.number() }),
        output: z.object({ doubled: z.number() }),
      }),
      async (_, input) => ({ doubled: input.value * 2 }),
    );

    const envelope = await getEnvelope("ok-channel", { value: 21 });

    expect(unwrapIpcEnvelope(envelope)).toEqual({ doubled: 42 });
    expect(mocks.sendTelemetryException).not.toHaveBeenCalled();
  });

  it("returns validation CaideError envelopes from typed handlers", async () => {
    createTypedHandler(
      defineContract({
        channel: "validation-channel",
        input: z.object({ value: z.number() }),
        output: z.void(),
      }),
      async () => undefined,
    );

    const envelope = await getEnvelope("validation-channel", { value: "nope" });

    expect(() => unwrapIpcEnvelope(envelope)).toThrow(CaideError);
    expect(() => unwrapIpcEnvelope(envelope)).toThrow(
      "[validation-channel] Invalid input",
    );
    expect(envelope.ok).toBe(false);
    if (envelope.ok === false) {
      expect(envelope.error.kind).toBe(CaideErrorKind.Validation);
    }
    expect(mocks.sendTelemetryException).not.toHaveBeenCalled();
  });

  it("returns handler CaideError envelopes after telemetry", async () => {
    createTypedHandler(
      defineContract({
        channel: "error-channel",
        input: z.object({}),
        output: z.void(),
      }),
      async () => {
        throw new CaideError("Already exists", CaideErrorKind.Conflict);
      },
    );

    const envelope = await getEnvelope("error-channel", {});

    expect(envelope.ok).toBe(false);
    if (envelope.ok === false) {
      expect(envelope.error.kind).toBe(CaideErrorKind.Conflict);
      expect(envelope.error.message).toBe("Already exists");
    }
    expect(() => unwrapIpcEnvelope(envelope)).toThrow(CaideError);
    expect(mocks.sendTelemetryException).toHaveBeenCalledTimes(1);
  });

  it("returns envelopes from legacy logged handlers", async () => {
    const logger = {
      debug: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
    };
    const handle = createLoggedHandler(logger as any);
    handle("legacy-channel", async () => {
      throw new CaideError("Legacy conflict", CaideErrorKind.Conflict);
    });

    const envelope = await getEnvelope("legacy-channel");

    expect(envelope.ok).toBe(false);
    if (envelope.ok === false) {
      expect(envelope.error.kind).toBe(CaideErrorKind.Conflict);
      expect(envelope.error.message).toBe("Legacy conflict");
    }
    expect(mocks.sendTelemetryException).toHaveBeenCalledTimes(1);
  });
});
