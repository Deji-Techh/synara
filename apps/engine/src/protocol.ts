// FILE: src/protocol.ts
// Purpose: JSON-RPC 2.0 transport over stdio for the Flutter Builder engine.
// Layer: Engine protocol — shared by engine process and server-side client
// Depends on: zod (repo-pinned 4.3.6)

import { z } from "zod";

export const ENGINE_PROTOCOL_VERSION = 1 as const;

export const ENGINE_METHODS = {
  initialize: "initialize",
  ping: "engine/ping",
  echo: "engine/echo",
  shutdown: "engine/shutdown",
  appCreate: "app/create",
  previewStart: "preview/start",
  previewStop: "preview/stop",
  previewReload: "preview/reload",
  previewState: "preview/state",
  analyzeRun: "analyze/run",
  testRun: "test/run",
  buildStart: "build/start",
  buildState: "build/state",
} as const;

export type EngineMethod = (typeof ENGINE_METHODS)[keyof typeof ENGINE_METHODS];

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string(), z.null()]),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

export const InitializeParamsSchema = z.object({
  clientName: z.string(),
  protocolVersion: z.number(),
});
export type InitializeParams = z.infer<typeof InitializeParamsSchema>;

export const InitializeResultSchema = z.object({
  serverName: z.literal("caide-engine"),
  serverVersion: z.string(),
  protocolVersion: z.number(),
  capabilities: z.object({
    flutter: z.boolean(),
    preview: z.boolean(),
  }),
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

export const PingResultSchema = z.object({
  pong: z.string(),
  time: z.string(),
});
export type PingResult = z.infer<typeof PingResultSchema>;

export const EchoParamsSchema = z.object({
  message: z.string(),
});
export type EchoParams = z.infer<typeof EchoParamsSchema>;

export const EchoResultSchema = z.object({
  message: z.string(),
});
export type EchoResult = z.infer<typeof EchoResultSchema>;

export const AppCreateParamsSchema = z.object({
  name: z.string(),
  cwd: z.string(),
  org: z.string().optional(),
  platforms: z.array(z.string()).optional(),
});
export type AppCreateParams = z.infer<typeof AppCreateParamsSchema>;

export const AppCreateResultSchema = z.object({
  appId: z.string(),
  projectPath: z.string(),
});
export type AppCreateResult = z.infer<typeof AppCreateResultSchema>;

export const PreviewStartParamsSchema = z.object({
  appDir: z.string(),
  port: z.number().int().optional(),
  hostname: z.string().optional(),
});
export type PreviewStartParams = z.infer<typeof PreviewStartParamsSchema>;

export const PreviewStartResultSchema = z.object({
  url: z.string(),
});
export type PreviewStartResult = z.infer<typeof PreviewStartResultSchema>;

export const PreviewStopParamsSchema = z.object({
  appDir: z.string(),
});
export type PreviewStopParams = z.infer<typeof PreviewStopParamsSchema>;

export const PreviewStopResultSchema = z.object({
  stopped: z.boolean(),
});
export type PreviewStopResult = z.infer<typeof PreviewStopResultSchema>;

export const PreviewReloadParamsSchema = z.object({
  appDir: z.string(),
  /** true = hot reload (r), false = hot restart (R). */
  hotReload: z.boolean(),
});
export type PreviewReloadParams = z.infer<typeof PreviewReloadParamsSchema>;

export const PreviewReloadResultSchema = z.object({
  /** false when no preview is running for appDir (or flutter is gone). */
  reloaded: z.boolean(),
});
export type PreviewReloadResult = z.infer<typeof PreviewReloadResultSchema>;

export const PreviewStateParamsSchema = z.object({
  appDir: z.string(),
});
export type PreviewStateParams = z.infer<typeof PreviewStateParamsSchema>;

export const PreviewStateResultSchema = z.object({
  running: z.boolean(),
  url: z.string(),
  logs: z.array(z.string()),
});
export type PreviewStateResult = z.infer<typeof PreviewStateResultSchema>;

// ── analyze ────────────────────────────────────────────────────────────

export const AnalyzeRunParamsSchema = z.object({
  appDir: z.string(),
});
export type AnalyzeRunParams = z.infer<typeof AnalyzeRunParamsSchema>;

export const SeveritySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** A single `flutter analyze` diagnostic. */
export const AnalyzeIssueSchema = z.object({
  severity: SeveritySchema,
  /** e.g. `lib/main.dart` */
  path: z.string(),
  /** 1-based, when the analyzer reports a location. */
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  message: z.string(),
});
export type AnalyzeIssue = z.infer<typeof AnalyzeIssueSchema>;

export const AnalyzeRunResultSchema = z.object({
  issues: z.array(AnalyzeIssueSchema),
  /** Raw analyzer output (kept for the Problems log). */
  output: z.string(),
});
export type AnalyzeRunResult = z.infer<typeof AnalyzeRunResultSchema>;

// ── test ───────────────────────────────────────────────────────────────

export const TestRunParamsSchema = z.object({
  appDir: z.string(),
  /** Optional path to a single test file, relative to appDir. */
  testPath: z.string().optional(),
});
export type TestRunParams = z.infer<typeof TestRunParamsSchema>;

export const TestResultSchema = z.object({
  passed: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  /** Raw `flutter test` output. */
  output: z.string(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

// ── build ──────────────────────────────────────────────────────────────

export const BuildTargetSchema = z.enum(["apk", "appbundle", "ipa"]);
export type BuildTarget = z.infer<typeof BuildTargetSchema>;

export const BuildStartParamsSchema = z.object({
  appDir: z.string(),
  target: BuildTargetSchema,
  /** Defaults to release when the pane asks; debug/profile for fast checks. */
  channel: z.enum(["debug", "profile", "release"]).optional(),
});
export type BuildStartParams = z.infer<typeof BuildStartParamsSchema>;

export const BuildStartResultSchema = z.object({
  buildId: z.string(),
});
export type BuildStartResult = z.infer<typeof BuildStartResultSchema>;

export const BuildStatusSchema = z.enum(["running", "succeeded", "failed"]);
export type BuildStatus = z.infer<typeof BuildStatusSchema>;

export const BuildStateParamsSchema = z.object({
  buildId: z.string(),
});
export type BuildStateParams = z.infer<typeof BuildStateParamsSchema>;

export const BuildStateResultSchema = z.object({
  buildId: z.string(),
  status: BuildStatusSchema,
  /** Exit code when finished (null while running). */
  exitCode: z.number().int().nullable().optional(),
  /** Location of the produced artifact, when the build finished successfully. */
  outputPath: z.string().nullable().optional(),
  /** Build output (newest last). */
  logs: z.array(z.string()),
  /** When the build failed to run at all (flutter missing, bad params). */
  error: z.string().nullable().optional(),
});
export type BuildStateResult = z.infer<typeof BuildStateResultSchema>;

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return JsonRpcRequestSchema.safeParse(value).success;
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return JsonRpcResponseSchema.safeParse(value).success;
}
