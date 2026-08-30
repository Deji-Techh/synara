import { Effect, Layer, Option, ServiceMap, Stream } from "effect";

export class AutomationService extends ServiceMap.Service<AutomationService, any>()(
  "caide/AutomationService",
) {
  static readonly layer = Layer.succeed(this, {
    list: () => Effect.succeed({ automations: [] }),
    getMemory: () => Effect.succeed({}),
    create: () => Effect.succeed({}),
    update: () => Effect.succeed({}),
    delete: () => Effect.succeed(undefined),
    runNow: () => Effect.succeed({}),
    cancelRun: () => Effect.succeed(undefined),
    markRunRead: () => Effect.succeed(undefined),
    archiveRun: () => Effect.succeed(undefined),
    resolveProposal: () => Effect.succeed(undefined),
    streamEvents: Stream.empty,
  } as any);
}

export class CheckpointDiffQuery extends ServiceMap.Service<CheckpointDiffQuery, any>()(
  "caide/CheckpointDiffQuery",
) {
  static readonly layer = Layer.succeed(this, {
    getCheckpointDiff: () => Effect.succeed(undefined),
  } as any);
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

// Returns schema-valid empty read model (snapshotSequence + updatedAt required by contracts)
const emptyReadModel = () => ({
  snapshotSequence: 0,
  spaces: [],
  projects: [],
  threads: [],
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid empty shell snapshot (same required fields)
const emptyShellSnapshot = () => ({
  snapshotSequence: 0,
  spaces: [],
  projects: [],
  threads: [],
  updatedAt: new Date().toISOString(),
});

export class OrchestrationEngineService extends ServiceMap.Service<
  OrchestrationEngineService,
  any
>()("caide/OrchestrationEngineService") {
  static readonly layer = Layer.succeed(this, {
    getEventHighWaterSequence: Effect.succeed(0),
    dispatch: () => Effect.succeed({} as any),
    getReadModel: () => Effect.succeed(emptyReadModel()),
    repairState: () => Effect.succeed(emptyReadModel()),
    readEvents: () => Stream.empty,
    readThreadEvents: () => Stream.empty,
    subscribeDomainEvents: Stream.empty,
    streamDomainEvents: Stream.empty,
  } as any);
}

export class ProviderCommandReactor extends ServiceMap.Service<ProviderCommandReactor, any>()(
  "caide/ProviderCommandReactor",
) {
  static readonly layer = Layer.succeed(this, {
    listBlockingDeliveries: () => Effect.succeed([]),
    reconcileDelivery: () => Effect.succeed({}),
  } as any);
}

export class ProjectionSnapshotQuery extends ServiceMap.Service<ProjectionSnapshotQuery, any>()(
  "caide/ProjectionSnapshotQuery",
) {
  static readonly layer = Layer.succeed(this, {
    getThreadDetailSnapshotById: () => Effect.succeed(undefined),
    getSpaceShellById: () => Effect.succeed(Option.none()),
    getProjectShellById: () => Effect.succeed(Option.none()),
    getShellSnapshot: () => Effect.succeed(emptyShellSnapshot()),
    getSnapshot: () => Effect.succeed(emptyReadModel()),
    getThreadShellById: () => Effect.succeed(Option.none()),
    getSnapshotSequence: () => Effect.succeed(0),
    getCounts: () => Effect.succeed({ spaces: 0, projects: 0, threads: 0 }),
    listArchivedWorktreeAssociations: () => Effect.succeed([]),
  } as any);
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
  static readonly layer = Layer.succeed(this, {
    getProfileStats: () => Effect.succeed({}),
    getProfileTokenStats: () => Effect.succeed({}),
  } as any);
}

export class ExternalMcpService extends ServiceMap.Service<ExternalMcpService, any>()(
  "caide/ExternalMcpService",
) {
  static readonly layer = Layer.succeed(this, {
    listIntegrations: () => Effect.succeed([]),
    streamEvents: Stream.empty,
  } as any);
}

export class ProviderAdapterRegistry extends ServiceMap.Service<ProviderAdapterRegistry, any>()(
  "caide/ProviderAdapterRegistry",
) {
  static readonly layer = Layer.succeed(this, {
    getAdapter: () => Option.none(),
    getByProvider: () =>
      Effect.succeed({
        goals: {
          create: () => Effect.succeed({}),
          list: () => Effect.succeed([]),
          get: () => Effect.succeed(Option.none()),
          cancel: () => Effect.succeed(undefined),
        },
        subagents: {
          list: () => Effect.succeed([]),
          stop: () => Effect.succeed(undefined),
        },
        hasSession: () => Effect.succeed(false),
        startPreviewSession: () => Effect.succeed(undefined),
        subscribeGoalEvents: () => Stream.empty,
        subscribeSubagentEvents: () => Stream.empty,
      }),
    listAdapters: () => [],
  } as any);
}

export class ProviderDiscoveryService extends ServiceMap.Service<ProviderDiscoveryService, any>()(
  "caide/ProviderDiscoveryService",
) {
  static readonly layer = Layer.succeed(this, {
    discover: () => Effect.succeed([]),
  } as any);
}

export class ProviderHealth extends ServiceMap.Service<ProviderHealth, any>()(
  "caide/ProviderHealth",
) {
  static readonly layer = Layer.succeed(this, {
    checkHealth: () => Effect.succeed({}),
  } as any);
}

export class ProviderService extends ServiceMap.Service<ProviderService, any>()(
  "caide/ProviderService",
) {
  static readonly layer = Layer.succeed(this, {
    listModels: () => Effect.succeed([]),
  } as any);
}

export function redactSensitiveProcessArgs(args: string[]): string[] {
  return args;
}
