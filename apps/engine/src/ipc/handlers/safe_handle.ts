import { ipcMain, IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import { CaideError } from "@/errors/caide_error";
import {
  createIpcErrorEnvelope,
  createIpcSuccessEnvelope,
} from "../contracts/core";
import { sendTelemetryException } from "../utils/telemetry";
import { IS_TEST_BUILD } from "../utils/test_utils";
import { registerLegacyIpcHandler } from "./base";

export function createLoggedHandler(logger: log.LogFunctions) {
  return (
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>,
  ) => {
    registerLegacyIpcHandler(channel, fn);
    ipcMain.handle(
      channel,
      async (event: IpcMainInvokeEvent, ...args: any[]) => {
        logger.debug(
          `IPC: ${channel} called with args: ${JSON.stringify(args)}`,
        );
        try {
          const result = await fn(event, ...args);
          logger.debug(
            `IPC: ${channel} returned: ${JSON.stringify(result)?.slice(0, 100)}...`,
          );
          return createIpcSuccessEnvelope(result);
        } catch (error) {
          logger.error(
            `Error in ${fn.name}: args: ${JSON.stringify(args)}`,
            error,
          );
          sendTelemetryException(error, { ipc_channel: channel });
          // Preserve CaideError so telemetry classification stay consistent.
          if (error instanceof CaideError) {
            return createIpcErrorEnvelope(error);
          }
          return createIpcErrorEnvelope(new Error(`[${channel}] ${error}`));
        }
      },
    );
  };
}

export function createTestOnlyLoggedHandler(logger: log.LogFunctions) {
  if (!IS_TEST_BUILD) {
    return (
      channel: string,
      fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>,
    ) => {
      registerLegacyIpcHandler(channel, fn);
    };
  }
  return createLoggedHandler(logger);
}
