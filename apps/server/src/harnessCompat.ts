import { Effect, Layer, ServiceMap } from "effect";

export class AutomationService extends ServiceMap.Service<AutomationService, any>()(
  "caide/AutomationService",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export class CheckpointDiffQuery extends ServiceMap.Service<CheckpointDiffQuery, any>()(
  "caide/CheckpointDiffQuery",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export function resolveThreadWorkspaceCwd(..._args: any[]): string {
  return process.cwd();
}

export function makeDispatchCommandNormalizer(..._args: any[]): any {
  return () => Effect.void;
}

export function makeImportThreadHandler(..._args: any[]): any {
  return () => Effect.void;
}

export class OrchestrationEngineService extends ServiceMap.Service<OrchestrationEngineService, any>()(
  "caide/OrchestrationEngineService",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export class ProviderCommandReactor extends ServiceMap.Service<ProviderCommandReactor, any>()(
  "caide/ProviderCommandReactor",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export class ProjectionSnapshotQuery extends ServiceMap.Service<ProjectionSnapshotQuery, any>()(
  "caide/ProjectionSnapshotQuery",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export function shouldPublishThreadShellForEvent(..._args: any[]): boolean {
  return false;
}

export function listProviderUsage(..._args: any[]): any[] {
  return [];
}

export function getProviderUsageSnapshot(..._args: any[]): any {
  return {};
}

export class ProfileStatsQuery extends ServiceMap.Service<ProfileStatsQuery, any>()(
  "caide/ProfileStatsQuery",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export class ExternalMcpService extends ServiceMap.Service<ExternalMcpService, any>()(
  "caide/ExternalMcpService",
) {
  static readonly layer = Layer.succeed(this, {} as any);
}

export function redactSensitiveProcessArgs(args: string[]): string[] {
  return args;
}
