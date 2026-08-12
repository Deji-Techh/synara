// FILE: src/index.ts
// Purpose: Flutter Builder engine — stdio JSON-RPC server entry point.
// Layer: Engine process entry. Spawned by apps/server (engine adapter) exactly
// like codex app-server: newline-delimited JSON-RPC over stdin/stdout.
// Depends on: ./protocol.ts

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  AppCreateParamsSchema,
  AppCreateResultSchema,
  EchoParamsSchema,
  ENGINE_METHODS,
  ENGINE_PROTOCOL_VERSION,
  InitializeParamsSchema,
  InitializeResultSchema,
  isJsonRpcRequest,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  PingResultSchema,
  PreviewReloadParamsSchema,
  PreviewReloadResultSchema,
  PreviewStartParamsSchema,
  PreviewStartResultSchema,
  PreviewStateParamsSchema,
  PreviewStateResultSchema,
  PreviewStopParamsSchema,
  PreviewStopResultSchema,
  type JsonRpcResponse,
} from "./protocol.ts";
import { startWebServerPreview, type WebServerPreview } from "./preview/webServerPreview.ts";
import { createFlutterApp } from "./tools/flutterCreate.ts";

export const ENGINE_SERVER_VERSION = "0.1.0";

function send(response: JsonRpcResponse): void {
  stdout.write(`${JSON.stringify(response)}\n`);
}

function sendResult(id: JsonRpcResponse["id"], result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id: JsonRpcResponse["id"], code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

class ProtocolParamError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const previews = new Map<string, WebServerPreview>();

async function stopAllPreviews(): Promise<void> {
  const stops = [...previews.values()].map((preview) => preview.stop());
  previews.clear();
  await Promise.allSettled(stops);
}

async function handleMethod(method: string, params: unknown): Promise<unknown> {
  switch (method) {
    case ENGINE_METHODS.initialize: {
      const parsed = InitializeParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "initialize params invalid");
      }
      const result = InitializeResultSchema.parse({
        serverName: "caide-engine",
        serverVersion: ENGINE_SERVER_VERSION,
        protocolVersion: ENGINE_PROTOCOL_VERSION,
        capabilities: {
          flutter: true,
          preview: true,
        },
      });
      return result;
    }
    case ENGINE_METHODS.previewStart: {
      const parsed = PreviewStartParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "preview/start params invalid");
      }
      const existing = previews.get(parsed.data.appDir);
      if (existing) {
        await existing.stop();
        previews.delete(parsed.data.appDir);
      }
      const preview = await startWebServerPreview({
        appDir: parsed.data.appDir,
        ...(parsed.data.port !== undefined ? { port: parsed.data.port } : {}),
        ...(parsed.data.hostname !== undefined ? { hostname: parsed.data.hostname } : {}),
      });
      previews.set(parsed.data.appDir, preview);
      preview.exited.catch(() => {
        previews.delete(parsed.data.appDir);
      });
      return PreviewStartResultSchema.parse({ url: preview.url });
    }
    case ENGINE_METHODS.previewStop: {
      const parsed = PreviewStopParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "preview/stop params invalid");
      }
      const preview = previews.get(parsed.data.appDir);
      if (!preview) {
        return PreviewStopResultSchema.parse({ stopped: false });
      }
      previews.delete(parsed.data.appDir);
      await preview.stop();
      return PreviewStopResultSchema.parse({ stopped: true });
    }
    case ENGINE_METHODS.previewReload: {
      const parsed = PreviewReloadParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "preview/reload params invalid");
      }
      const preview = previews.get(parsed.data.appDir);
      return PreviewReloadResultSchema.parse({
        reloaded: preview?.reload(parsed.data.hotReload) ?? false,
      });
    }
    case ENGINE_METHODS.previewState: {
      const parsed = PreviewStateParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "preview/state params invalid");
      }
      const preview = previews.get(parsed.data.appDir);
      return PreviewStateResultSchema.parse({
        running: preview !== undefined,
        url: preview?.url ?? "",
        logs: preview?.logs ? [...preview.logs] : [],
      });
    }
    case ENGINE_METHODS.appCreate: {
      const parsed = AppCreateParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "app/create params invalid");
      }
      const { projectPath } = await createFlutterApp({
        cwd: parsed.data.cwd,
        name: parsed.data.name,
        org: parsed.data.org,
        platforms: parsed.data.platforms,
      });
      return AppCreateResultSchema.parse({
        appId: parsed.data.name,
        projectPath,
      });
    }
    case ENGINE_METHODS.ping: {
      return PingResultSchema.parse({ pong: "pong", time: new Date().toISOString() });
    }
    case ENGINE_METHODS.echo: {
      const parsed = EchoParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw new ProtocolParamError(JSON_RPC_INVALID_PARAMS, "echo params invalid");
      }
      return { message: parsed.data.message };
    }
    case ENGINE_METHODS.shutdown: {
      // Do not process.exit() here: it truncates the buffered stdout write of
      // this very response. Set the exit code and let the loop end naturally.
      process.exitCode = 0;
      return { shutdown: true };
    }
    default:
      throw new ProtocolParamError(JSON_RPC_METHOD_NOT_FOUND, `unknown method: ${method}`);
  }
}

export async function runEngine(): Promise<void> {
  const lines = createInterface({
    input: stdin,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      sendError(null, JSON_RPC_PARSE_ERROR, "invalid JSON");
      continue;
    }
    if (!isJsonRpcRequest(request)) {
      sendError(null, JSON_RPC_INVALID_PARAMS, "invalid request envelope");
      continue;
    }
    try {
      const result = await handleMethod(request.method, request.params);
      sendResult(request.id, result);
      if (request.method === ENGINE_METHODS.shutdown) {
        // Stop any running previews, then close the interface so the process
        // exits once stdin (kept open by the parent) stops holding the loop.
        await stopAllPreviews();
        lines.close();
        break;
      }
    } catch (error) {
      const code = error instanceof ProtocolParamError ? error.code : JSON_RPC_INTERNAL_ERROR;
      const message = error instanceof Error ? error.message : String(error);
      sendError(request.id, code, message);
    }
  }
}

if (import.meta.main) {
  runEngine();
}
