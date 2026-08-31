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
    streamEvents: Stream.never,
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

const inMemoryProjects: any[] = [];
const inMemoryThreads: any[] = [];

// Returns schema-valid empty read model (snapshotSequence + updatedAt required by contracts)
const emptyReadModel = () => ({
  snapshotSequence: 0,
  spaces: [],
  projects: inMemoryProjects,
  threads: inMemoryThreads,
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid empty shell snapshot (same required fields)
const emptyShellSnapshot = () => ({
  snapshotSequence: 0,
  spaces: [],
  projects: inMemoryProjects,
  threads: inMemoryThreads,
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid thread detail snapshot
const emptyThreadDetailSnapshot = (threadId: string) => {
  const existing = inMemoryThreads.find((t) => t.id === threadId);
  return {
    snapshotSequence: 0,
    thread: {
      id: threadId,
      projectId: existing?.projectId ?? "default",
      title: existing?.title ?? "New Chat",
      modelSelection: { provider: "opencode", model: "default" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastVisitedAt: new Date().toISOString(),
      turns: [],
      messages: [],
      activities: [],
      proposedPlans: [],
      turnDiffSummaries: [],
    },
  };
};

export class OrchestrationEngineService extends ServiceMap.Service<
  OrchestrationEngineService,
  any
>()("caide/OrchestrationEngineService") {
  static readonly layer = Layer.succeed(this, {
    getEventHighWaterSequence: Effect.succeed(0),
    dispatch: () => Effect.succeed({} as any),
    getReadModel: () => Effect.succeed(emptyReadModel()),
    repairState: () => Effect.succeed(emptyReadModel()),
    readEvents: () => Stream.never,
    readEventsThrough: () => Stream.never,
    readThreadEvents: () => Stream.never,
    readThreadEventsThrough: () => Stream.never,
    subscribeDomainEvents: Effect.succeed(Stream.never),
    streamDomainEvents: Stream.never,
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
    getThreadDetailSnapshotById: (threadId: string) =>
      Effect.succeed(Option.some(emptyThreadDetailSnapshot(threadId))),
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

const emptyProfileStats = () => ({
  generatedAt: new Date().toISOString(),
  timezone: "UTC",
  identity: {
    handle: "Developer",
    displayName: "Caide Developer",
    avatarUrl: null,
  },
  activity: {
    totalSessions: 0,
    totalTurns: 0,
    activeDays: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
  },
  activeHours: {
    hours: [],
    peakHour: null,
  },
  insights: {
    summary: "Welcome to Caide! Build your first AI application.",
    strengths: [],
  },
  providerModels: [],
  skills: [],
  mostUsedSkill: null,
  mostWorkedProject: null,
  frameworks: [],
  mostUsedFramework: null,
  quota: {
    used: 0,
    limit: null,
  },
});

const emptyProfileTokenStats = () => ({
  available: true,
  lifetimeTotalTokens: 0,
  breakdown: [],
});

export class ProfileStatsQuery extends ServiceMap.Service<ProfileStatsQuery, any>()(
  "caide/ProfileStatsQuery",
) {
  static readonly layer = Layer.succeed(this, {
    getProfileStats: () => Effect.succeed(emptyProfileStats()),
    getProfileTokenStats: () => Effect.succeed(emptyProfileTokenStats()),
  } as any);
}

export class ExternalMcpService extends ServiceMap.Service<ExternalMcpService, any>()(
  "caide/ExternalMcpService",
) {
  static readonly layer = Layer.succeed(this, {
    listIntegrations: () => Effect.succeed([]),
    streamEvents: Stream.never,
  } as any);
}

export class ProviderAdapterRegistry extends ServiceMap.Service<ProviderAdapterRegistry, any>()(
  "caide/ProviderAdapterRegistry",
) {
  static readonly layer = Layer.succeed(this, {
    getAdapter: () => Option.none(),
    getByProvider: () =>
      Effect.succeed({
        createApp: (input: { name: string; framework?: any }) =>
          Effect.promise(async () => {
            const { getCaideAppPath } = await import("./paths/caideApps.ts");
            const { getFrameworkConfig } = await import("./harness/framework/registry.ts");
            const appPath = getCaideAppPath(input.name);
            const framework = input.framework ?? "blank";
            const config = getFrameworkConfig(framework);
            await config.scaffold(appPath, input.name);
            const projectId = crypto.randomUUID();
            const threadId = crypto.randomUUID();
            const now = new Date().toISOString();
            inMemoryProjects.push({
              id: projectId,
              name: input.name,
              workspaceRoot: appPath,
              framework,
              createdAt: now,
              updatedAt: now,
            });
            inMemoryThreads.push({
              id: threadId,
              projectId,
              title: input.name,
              createdAt: now,
              updatedAt: now,
            });
            return {
              projectId,
              threadId,
              appId: 1,
              chatId: 1,
              appPath,
              framework,
            };
          }),
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
        subscribeGoalEvents: () => Stream.never,
        subscribeSubagentEvents: () => Stream.never,
      }),
    listAdapters: () => [],
  } as any);
}

const HARNESS_SKILLS = [
  {
    name: "ui-ux-mastery",
    description: "Product archetypes, design system, component contracts, a11y, anti-slop, and motion direction",
    path: "harness/skills/ui-ux-mastery.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "UI/UX Mastery",
      shortDescription: "Design tokens, styling, tap targets, empty/loading/error states",
    },
  },
  {
    name: "motion-interaction",
    description: "Spring physics, timing curves, gesture choreography, and haptics",
    path: "harness/skills/motion-interaction.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "Motion & Interaction",
      shortDescription: "Platform springs, 220ms transitions, reduced-motion fallbacks",
    },
  },
  {
    name: "product-flow",
    description: "spec.md construction, user flows, and state machine validation",
    path: "harness/skills/product-flow.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "Product Flow & Spec",
      shortDescription: "Spec gate, flow definitions, core slices",
    },
  },
  {
    name: "anti-ai-slop",
    description: "Prevents generic AI templates, gradient abuse, and placeholder text",
    path: "harness/skills/anti-ai-slop.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "Anti-AI Slop",
      shortDescription: "Clean, intentional styling without AI stereotypes",
    },
  },
  {
    name: "backend-production",
    description: "Security, schema validation, data model correctness, and API contracts",
    path: "harness/skills/backend-production.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "Backend Production",
      shortDescription: "Secure storage, error handling, strict types",
    },
  },
  {
    name: "platform-patterns",
    description: "iOS SF Symbols, Android Material, and cross-platform native patterns",
    path: "harness/skills/platform-patterns.md",
    enabled: true,
    scope: "caide",
    interface: {
      displayName: "Platform Patterns",
      shortDescription: "Native platform conventions for React Native, Flutter, Web",
    },
  },
];

const DEFAULT_MODELS_BY_PROVIDER: Record<string, any[]> = {
  opencodeZen: [
    {
      slug: "gpt-5.6-sol",
      name: "gpt-5.6-sol",
      description: "Fast reasoning and high performance code generation",
      supportsFastMode: true,
      supportedReasoningEfforts: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultReasoningEffort: "medium",
    },
    {
      slug: "zen-pro",
      name: "Zen Pro",
      description: "High intelligence reasoning model",
      supportsFastMode: true,
    },
    {
      slug: "zen-flash",
      name: "Zen Flash",
      description: "Lightweight, ultra-fast responses",
      supportsFastMode: true,
    },
  ],
  opencodeGo: [
    {
      slug: "gpt-5.6-sol",
      name: "gpt-5.6-sol",
      description: "Fast reasoning and high performance code generation",
      supportsFastMode: true,
      supportedReasoningEfforts: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultReasoningEffort: "medium",
    },
    {
      slug: "go-standard",
      name: "Go Standard",
      description: "Direct OpenCode Go model",
      supportsFastMode: true,
    },
  ],
  groq: [
    {
      slug: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B",
      description: "Versatile open-weights model on Groq",
      supportsFastMode: true,
    },
    {
      slug: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B",
      description: "Instant response model on Groq",
      supportsFastMode: true,
    },
  ],
  anthropic: [
    {
      slug: "claude-3-7-sonnet-latest",
      name: "Claude 3.7 Sonnet",
      description: "Hybrid reasoning and coding model",
      supportsFastMode: true,
      supportedReasoningEfforts: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultReasoningEffort: "medium",
    },
    {
      slug: "claude-3-5-sonnet-latest",
      name: "Claude 3.5 Sonnet",
      description: "Industry standard coding model",
      supportsFastMode: true,
    },
  ],
  openai: [
    {
      slug: "gpt-4o",
      name: "GPT-4o",
      description: "Omni-modal flagship model",
      supportsFastMode: true,
    },
    {
      slug: "o3-mini",
      name: "o3-mini",
      description: "High-reasoning math and coding model",
      supportsFastMode: true,
      supportedReasoningEfforts: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultReasoningEffort: "medium",
    },
  ],
  engine: [
    {
      slug: "caide-pure",
      name: "Caide Pure Engine",
      description: "Autonomous pure harness agent runtime",
      supportsFastMode: true,
    },
  ],
};

export class ProviderDiscoveryService extends ServiceMap.Service<ProviderDiscoveryService, any>()(
  "caide/ProviderDiscoveryService",
) {
  static readonly layer = Layer.succeed(this, {
    discover: () => Effect.succeed([]),
    listSkills: () => Effect.succeed({ skills: HARNESS_SKILLS, source: "caide-harness", cached: true }),
    listSkillsCatalog: () => Effect.succeed({ skills: HARNESS_SKILLS, caideSkillsDir: "~/.caide/skills" }),
    listCommands: () => Effect.succeed({ commands: [], source: "empty", cached: true }),
    listModels: (input?: { provider?: string }) => {
      const provider = input?.provider ?? "opencodeZen";
      const models = DEFAULT_MODELS_BY_PROVIDER[provider] ?? DEFAULT_MODELS_BY_PROVIDER.opencodeZen;
      return Effect.succeed({ models, source: "harness", cached: true });
    },
    listAgents: () => Effect.succeed({ agents: [], source: "empty", cached: true }),
    listPlugins: () =>
      Effect.succeed({
        marketplaces: [],
        marketplaceLoadErrors: [],
        remoteSyncError: null,
        featuredPluginIds: [],
        source: "empty",
        cached: true,
      }),
    getComposerCapabilities: (input?: { provider?: string }) =>
      Effect.succeed({
        provider: input?.provider ?? "opencodeZen",
        supportsSkillMentions: true,
        supportsSkillDiscovery: true,
        supportsNativeSlashCommandDiscovery: false,
        supportsPluginMentions: false,
        supportsPluginDiscovery: false,
        supportsRuntimeModelList: true,
      }),
  } as any);
}

const DEFAULT_PROVIDER_STATUSES = [
  {
    provider: "opencodeZen",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "OpenCode Zen connected",
  },
  {
    provider: "opencodeGo",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "OpenCode Go connected",
  },
  {
    provider: "groq",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "Groq ready",
  },
  {
    provider: "anthropic",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "Anthropic ready",
  },
  {
    provider: "openai",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "OpenAI ready",
  },
  {
    provider: "engine",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: new Date().toISOString(),
    message: "Caide Pure Harness ready",
  },
];

export class ProviderHealth extends ServiceMap.Service<ProviderHealth, any>()(
  "caide/ProviderHealth",
) {
  static readonly layer = Layer.succeed(this, {
    checkHealth: () => Effect.succeed({}),
    getStatuses: Effect.succeed(DEFAULT_PROVIDER_STATUSES),
    refresh: Effect.succeed(DEFAULT_PROVIDER_STATUSES),
    updateProvider: () => Effect.succeed({ providers: DEFAULT_PROVIDER_STATUSES }),
    streamChanges: Stream.never,
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
