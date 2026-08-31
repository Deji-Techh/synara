import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
  return ({ command }: { command: any }) =>
    Effect.succeed({ command, prepareWorkspaceRoot: undefined });
}

export function makeImportThreadHandler(..._args: any[]): any {
  return () => Effect.succeed({});
}

const CAIDE_APPS_DIR = path.join(process.env.HOME || "/home/DejiTech", "caide-apps");
const PROJECTS_JSON_FILE = path.join(CAIDE_APPS_DIR, "projects.json");
const THREADS_JSON_FILE = path.join(CAIDE_APPS_DIR, "threads.json");

let globalSnapshotSequence = 1;
const inMemoryProjects: any[] = [];
const inMemoryThreads: any[] = [];

function getProviderApiKeyDirect(providerName: string): string {
  const home = process.env.HOME || "/home/DejiTech";
  const secretFileNames = [
    `provider-${providerName}-api-key.bin`,
    `provider-${providerName.toLowerCase()}-api-key.bin`,
  ];
  for (const fn of secretFileNames) {
    const secretPath = path.join(home, ".caide/userdata/secrets", fn);
    if (fs.existsSync(secretPath)) {
      try {
        const key = fs.readFileSync(secretPath, "utf-8").trim();
        if (key) return key;
      } catch {
        // ignore
      }
    }
  }
  return "";
}

function loadPersistedState() {
  try {
    if (!fs.existsSync(CAIDE_APPS_DIR)) {
      fs.mkdirSync(CAIDE_APPS_DIR, { recursive: true });
    }
    if (fs.existsSync(PROJECTS_JSON_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PROJECTS_JSON_FILE, "utf-8"));
      if (Array.isArray(raw)) {
        for (const p of raw) {
          if (!inMemoryProjects.some((existing) => existing.id === p.id)) {
            inMemoryProjects.push({
              id: p.id,
              title: p.name || p.title || "Project",
              name: p.name || p.title || "Project",
              kind: p.kind || "project",
              workspaceRoot: p.workspaceRoot || path.join(CAIDE_APPS_DIR, p.id),
              cwd: p.workspaceRoot || path.join(CAIDE_APPS_DIR, p.id),
              framework: p.framework || "blank",
              scripts: p.scripts || [],
              defaultModelSelection: p.defaultModelSelection || null,
              isPinned: Boolean(p.isPinned),
              spaceId: p.spaceId || null,
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.updatedAt || new Date().toISOString(),
              deletedAt: null,
            });
          }
        }
      }
    }
    if (fs.existsSync(THREADS_JSON_FILE)) {
      const raw = JSON.parse(fs.readFileSync(THREADS_JSON_FILE, "utf-8"));
      if (Array.isArray(raw)) {
        for (const t of raw) {
          if (!inMemoryThreads.some((existing) => existing.id === t.id)) {
            inMemoryThreads.push({
              id: t.id,
              projectId: t.projectId || "default",
              title: t.title || "Chat",
              modelSelection: t.modelSelection || { provider: "opencodeZen", model: "default" },
              runtimeMode: t.runtimeMode || "full-access",
              interactionMode: t.interactionMode || "default",
              envMode: t.envMode || "local",
              branch: t.branch || null,
              worktreePath: t.worktreePath || null,
              workingDirectory: t.workingDirectory || null,
              associatedWorktreePath: t.associatedWorktreePath || null,
              associatedWorktreeBranch: t.associatedWorktreeBranch || null,
              associatedWorktreeRef: t.associatedWorktreeRef || null,
              createdAt: t.createdAt || new Date().toISOString(),
              updatedAt: t.updatedAt || new Date().toISOString(),
              lastVisitedAt: t.lastVisitedAt || new Date().toISOString(),
              archivedAt: t.archivedAt || null,
              turns: t.turns || [],
              messages: t.messages || [],
              activities: t.activities || [],
              proposedPlans: t.proposedPlans || [],
              turnDiffSummaries: t.turnDiffSummaries || [],
            });
          }
        }
      }
    }

    if (fs.existsSync(CAIDE_APPS_DIR)) {
      const entries = fs.readdirSync(CAIDE_APPS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const appName = entry.name;
          const appPath = path.join(CAIDE_APPS_DIR, appName);
          const existingProject = inMemoryProjects.find(
            (p) => p.workspaceRoot === appPath || p.name === appName || p.title === appName,
          );
          if (!existingProject) {
            let framework = "blank";
            if (fs.existsSync(path.join(appPath, "pubspec.yaml"))) {
              framework = "flutter";
            } else if (
              fs.existsSync(path.join(appPath, "app.json")) ||
              fs.existsSync(path.join(appPath, "App.tsx"))
            ) {
              framework = "react-native";
            } else if (fs.existsSync(path.join(appPath, "index.html"))) {
              framework = "website";
            }
            const pid = `project-${appName}`;
            const tid = `thread-${appName}`;
            const now = new Date().toISOString();
            inMemoryProjects.push({
              id: pid,
              title: appName,
              name: appName,
              kind: "project",
              workspaceRoot: appPath,
              cwd: appPath,
              framework,
              scripts: [],
              defaultModelSelection: null,
              isPinned: false,
              spaceId: null,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
            inMemoryThreads.push({
              id: tid,
              projectId: pid,
              title: appName,
              modelSelection: { provider: "opencodeZen", model: "default" },
              runtimeMode: "full-access",
              interactionMode: "default",
              envMode: "local",
              branch: null,
              worktreePath: null,
              workingDirectory: null,
              associatedWorktreePath: null,
              associatedWorktreeBranch: null,
              associatedWorktreeRef: null,
              createdAt: now,
              updatedAt: now,
              lastVisitedAt: now,
              archivedAt: null,
              turns: [],
              messages: [],
              activities: [],
              proposedPlans: [],
              turnDiffSummaries: [],
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[harnessCompat] Failed to load persisted state", err);
  }
}

function savePersistedState() {
  try {
    if (!fs.existsSync(CAIDE_APPS_DIR)) {
      fs.mkdirSync(CAIDE_APPS_DIR, { recursive: true });
    }
    fs.writeFileSync(PROJECTS_JSON_FILE, JSON.stringify(inMemoryProjects, null, 2), "utf-8");
    fs.writeFileSync(THREADS_JSON_FILE, JSON.stringify(inMemoryThreads, null, 2), "utf-8");
  } catch (err) {
    console.error("[harnessCompat] Failed to save persisted state", err);
  }
}

loadPersistedState();

// Returns schema-valid empty read model (snapshotSequence + updatedAt required by contracts)
const emptyReadModel = () => ({
  snapshotSequence: globalSnapshotSequence,
  spaces: [],
  projects: inMemoryProjects,
  threads: inMemoryThreads,
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid empty shell snapshot (same required fields)
const emptyShellSnapshot = () => ({
  snapshotSequence: globalSnapshotSequence,
  spaces: [],
  projects: inMemoryProjects,
  threads: inMemoryThreads,
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid thread detail snapshot
const emptyThreadDetailSnapshot = (threadId: string) => {
  const existing = inMemoryThreads.find((t) => t.id === threadId);
  const now = new Date().toISOString();
  return {
    snapshotSequence: globalSnapshotSequence,
    thread: {
      id: threadId,
      projectId: existing?.projectId ?? "default",
      title: existing?.title ?? "New Chat",
      modelSelection: existing?.modelSelection ?? { provider: "opencodeZen", model: "default" },
      runtimeMode: existing?.runtimeMode ?? "full-access",
      interactionMode: existing?.interactionMode ?? "default",
      envMode: existing?.envMode ?? "local",
      branch: existing?.branch ?? null,
      worktreePath: existing?.worktreePath ?? null,
      workingDirectory: existing?.workingDirectory ?? null,
      associatedWorktreePath: existing?.associatedWorktreePath ?? null,
      associatedWorktreeBranch: existing?.associatedWorktreeBranch ?? null,
      associatedWorktreeRef: existing?.associatedWorktreeRef ?? null,
      createBranchFlowCompleted: false,
      isPinned: false,
      parentThreadId: null,
      creationSource: null,
      sourceThreadId: null,
      sourceTurnId: null,
      gatewayOperationId: null,
      gatewayOperationIndex: null,
      subagentAgentId: null,
      subagentNickname: null,
      subagentRole: null,
      forkSourceThreadId: null,
      sidechatSourceThreadId: null,
      lastKnownPr: null,
      latestTurn: existing?.latestTurn ?? null,
      latestUserMessageAt: existing?.latestUserMessageAt ?? null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
      lastVisitedAt: existing?.lastVisitedAt ?? now,
      archivedAt: existing?.archivedAt ?? null,
      settledAt: null,
      deletedAt: null,
      handoff: null,
      pinnedMessages: [],
      turns: existing?.turns ?? [],
      messages: existing?.messages ?? [],
      activities: existing?.activities ?? [],
      proposedPlans: existing?.proposedPlans ?? [],
      turnDiffSummaries: existing?.turnDiffSummaries ?? [],
    },
  };
};

export class OrchestrationEngineService extends ServiceMap.Service<
  OrchestrationEngineService,
  any
>()("caide/OrchestrationEngineService") {
  static readonly layer = Layer.succeed(this, {
    getEventHighWaterSequence: Effect.succeed(0),
    dispatch: (command: any) =>
      Effect.sync(() => {
        const now = new Date().toISOString();
        if (command?.type === "project.create") {
          const existing = inMemoryProjects.find((p) => p.id === command.projectId);
          if (!existing) {
            inMemoryProjects.push({
              id: command.projectId,
              title: command.title ?? "Home",
              name: command.title ?? "Home",
              kind: command.kind ?? "project",
              workspaceRoot: command.workspaceRoot,
              cwd: command.workspaceRoot,
              framework: command.framework ?? "blank",
              scripts: [],
              defaultModelSelection: command.defaultModelSelection ?? null,
              isPinned: false,
              spaceId: command.spaceId ?? null,
              createdAt: command.createdAt ?? now,
              updatedAt: command.createdAt ?? now,
              deletedAt: null,
            });
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "project.meta.update") {
          const existing = inMemoryProjects.find((p) => p.id === command.projectId);
          if (existing) {
            if (command.title !== undefined) {
              existing.title = command.title;
              existing.name = command.title;
            }
            if (command.kind !== undefined) existing.kind = command.kind;
            existing.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "project.delete") {
          const index = inMemoryProjects.findIndex((p) => p.id === command.projectId);
          if (index !== -1) {
            inMemoryProjects.splice(index, 1);
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "thread.create") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (!existing) {
            inMemoryThreads.push({
              id: command.threadId,
              projectId: command.projectId,
              title: command.title ?? "New Chat",
              modelSelection: command.modelSelection ?? { provider: "opencodeZen", model: "default" },
              runtimeMode: command.runtimeMode ?? "full-access",
              interactionMode: command.interactionMode ?? "default",
              envMode: "local",
              branch: command.branch ?? null,
              worktreePath: command.worktreePath ?? null,
              workingDirectory: command.workingDirectory ?? null,
              associatedWorktreePath: command.associatedWorktreePath ?? null,
              associatedWorktreeBranch: command.associatedWorktreeBranch ?? null,
              associatedWorktreeRef: command.associatedWorktreeRef ?? null,
              createdAt: command.createdAt ?? now,
              updatedAt: command.createdAt ?? now,
              lastVisitedAt: command.createdAt ?? now,
              archivedAt: null,
              turns: [],
              messages: [],
              activities: [],
              proposedPlans: [],
              turnDiffSummaries: [],
            });
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "thread.meta.update") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (existing) {
            if (command.title !== undefined) existing.title = command.title;
            existing.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "thread.archive") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (existing) {
            existing.archivedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "thread.delete") {
          const index = inMemoryThreads.findIndex((t) => t.id === command.threadId);
          if (index !== -1) {
            inMemoryThreads.splice(index, 1);
            globalSnapshotSequence += 1;
            savePersistedState();
          }
        } else if (command?.type === "thread.turn.start") {
          let thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (!thread) {
            thread = {
              id: command.threadId,
              projectId: command.projectId ?? "default",
              title: "New Chat",
              modelSelection: command.modelSelection ?? { provider: "opencodeZen", model: "default" },
              runtimeMode: command.runtimeMode ?? "full-access",
              interactionMode: command.interactionMode ?? "default",
              envMode: "local",
              branch: null,
              worktreePath: null,
              workingDirectory: null,
              associatedWorktreePath: null,
              associatedWorktreeBranch: null,
              associatedWorktreeRef: null,
              createdAt: now,
              updatedAt: now,
              lastVisitedAt: now,
              archivedAt: null,
              turns: [],
              messages: [],
              activities: [],
              proposedPlans: [],
              turnDiffSummaries: [],
            };
            inMemoryThreads.push(thread);
          }

          const turnId = `turn-${Date.now().toString(36)}`;
          const userMsgId = command.message?.messageId || `msg-${Date.now().toString(36)}`;
          const userMsg = {
            id: userMsgId,
            role: "user",
            text: command.message?.text || "",
            attachments: command.message?.attachments ?? [],
            skills: command.message?.skills ?? [],
            mentions: command.message?.mentions ?? [],
            dispatchMode: command.dispatchMode ?? "prompt",
            turnId,
            streaming: false,
            source: "native",
            createdAt: command.createdAt ?? now,
            updatedAt: command.createdAt ?? now,
          };
          thread.messages.push(userMsg);

          const turn = {
            id: turnId,
            status: "running",
            userMessageId: userMsgId,
            createdAt: now,
            updatedAt: now,
          };
          thread.turns.push(turn);
          thread.latestTurn = {
            turnId,
            state: "running",
            status: "running",
            startedAt: now,
            completedAt: null,
          };
          thread.latestUserMessageAt = now;
          thread.updatedAt = now;

          if ((thread.title === "New Chat" || thread.title === "Home") && userMsg.text) {
            thread.title = userMsg.text.slice(0, 36).trim();
          }

          const assistantMsgId = `msg-asst-${Date.now().toString(36)}`;
          const assistantMsg = {
            id: assistantMsgId,
            role: "assistant",
            text: "",
            streaming: true,
            turnId,
            source: "native",
            createdAt: now,
            updatedAt: now,
          };
          thread.messages.push(assistantMsg);
          globalSnapshotSequence += 1;
          savePersistedState();

          // Spawn background LLM streaming execution
          void (async () => {
            try {
              const { streamProvider } = await import("./harness/provider/apiAdapter.ts");
              const modelSelection = command.modelSelection || thread.modelSelection || { provider: "opencodeZen", model: "gpt-5.6-sol" };
              const provider = modelSelection.provider || "opencodeZen";
              const modelId = modelSelection.model && modelSelection.model !== "default" ? modelSelection.model : "gpt-5.6-sol";

              let baseUrl = "https://opencode.ai/zen/v1";
              if (provider === "opencodeGo") {
                baseUrl = "https://opencode.ai/zen/go/v1";
              } else if (provider === "groq") {
                baseUrl = "https://api.groq.com/openai/v1";
              }

              let apiKey = getProviderApiKeyDirect(provider);
              if (!apiKey && provider !== "opencodeZen") {
                apiKey = getProviderApiKeyDirect("opencodeZen");
              }
              if (!apiKey) {
                apiKey = getProviderApiKeyDirect("opencodeGo");
              }

              const chatHistory = thread.messages
                .filter((m: any) => m.id !== assistantMsgId && m.text)
                .map((m: any) => ({
                  role: m.role === "assistant" ? "assistant" : "user",
                  content: m.text,
                }));

              const stream = streamProvider({
                modelId,
                baseUrl,
                apiKey: apiKey || "dummy-key",
                messages: chatHistory,
              });

              for await (const chunk of stream) {
                if (chunk.type === "token" && chunk.content) {
                  assistantMsg.text += chunk.content;
                  assistantMsg.updatedAt = new Date().toISOString();
                  globalSnapshotSequence += 1;
                }
              }

              assistantMsg.streaming = false;
              turn.status = "completed";
              thread.latestTurn = {
                turnId,
                state: "completed",
                status: "completed",
                startedAt: now,
                completedAt: new Date().toISOString(),
              };
              globalSnapshotSequence += 1;
              savePersistedState();
            } catch (err: any) {
              console.error("[harnessCompat] LLM turn error", err);
              assistantMsg.streaming = false;
              if (!assistantMsg.text) {
                assistantMsg.text = `Error: ${err?.message || "Failed to generate response."}`;
              }
              turn.status = "failed";
              thread.latestTurn = {
                turnId,
                state: "failed",
                status: "failed",
                startedAt: now,
                completedAt: new Date().toISOString(),
              };
              globalSnapshotSequence += 1;
              savePersistedState();
            }
          })();
        }
        return {} as any;
      }),
    getReadModel: () => Effect.sync(() => emptyReadModel()),
    repairState: () => Effect.sync(() => emptyReadModel()),
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
      Effect.sync(() => Option.some(emptyThreadDetailSnapshot(threadId))),
    getSpaceShellById: () => Effect.succeed(Option.none()),
    getProjectShellById: (projectId: string) =>
      Effect.sync(() => {
        const p = inMemoryProjects.find((entry) => entry.id === projectId);
        return p ? Option.some(p) : Option.none();
      }),
    getShellSnapshot: () => Effect.sync(() => emptyShellSnapshot()),
    getSnapshot: () => Effect.sync(() => emptyReadModel()),
    getThreadShellById: (threadId: string) =>
      Effect.sync(() => {
        const t = inMemoryThreads.find((entry) => entry.id === threadId);
        return t ? Option.some(t) : Option.none();
      }),
    getSnapshotSequence: () => Effect.succeed({ snapshotSequence: globalSnapshotSequence }),
    getCounts: () =>
      Effect.sync(() => ({
        spaces: 0,
        projects: inMemoryProjects.length,
        threads: inMemoryThreads.length,
      })),
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

const emptyProfileStats = (utcOffsetMinutes = 0) => ({
  generatedAt: new Date().toISOString(),
  timezone: {
    utcOffsetMinutes,
    today: new Date().toISOString().slice(0, 10),
  },
  identity: {
    homeDirBasename: "DejiTech",
    initials: "CD",
    defaultHandle: "Developer",
  },
  activity: {
    currentStreakDays: 0,
    longestStreakDays: 0,
    totalPromptsSent: 0,
    totalThreads: 0,
    promptsToday: 0,
    heatmapMetric: "prompts" as const,
    heatmap: [],
  },
  summary: {
    tokensPerDayAvg: 0,
    peakDayTokens: null,
    totalTokensFormatted: "0",
    topModel: null,
    topProvider: null,
  },
  lifetimeTotalTokens: 0,
  peakDayTokens: null,
  peakDay: null,
  providers: [],
  unavailableProviders: [],
  activeHours: {
    startHour: null,
    endHour: null,
    turnCount: 0,
    label: null,
  },
  insights: {
    topProvider: null,
    topProviderPercent: null,
    topReasoning: null,
    topReasoningPercent: null,
    skillsExplored: 0,
    totalSkillsUsed: 0,
  },
  providerModels: [],
  skills: [],
  mostUsedSkill: null,
  mostWorkedProject: null,
  frameworks: [],
  mostUsedFramework: null,
  quota: {
    status: "unavailable" as const,
    provider: null,
    window: null,
    usedPercent: null,
    resetsAt: null,
    planName: null,
  },
});

const emptyProfileTokenStats = () => ({
  available: true,
  lifetimeTotalTokens: 0,
  peakDayTokens: null,
  peakDay: null,
  providers: [],
  unavailableProviders: [],
  topProvider: null,
  topProviderPercent: null,
  models: [],
  heatmapMetric: "tokens" as const,
  heatmap: [],
});

export class ProfileStatsQuery extends ServiceMap.Service<ProfileStatsQuery, any>()(
  "caide/ProfileStatsQuery",
) {
  static readonly layer = Layer.succeed(this, {
    getProfileStats: (input?: { utcOffsetMinutes?: number }) =>
      Effect.succeed(emptyProfileStats(input?.utcOffsetMinutes ?? 0)),
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
            return {
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
          getActive: () => Effect.succeed(Option.none()),
          listActivity: () => Effect.succeed([]),
          listRuns: () => Effect.succeed([]),
          pause: () => Effect.succeed(undefined),
          resume: () => Effect.succeed(undefined),
          cancel: () => Effect.succeed(undefined),
          edit: () => Effect.succeed(undefined),
          steer: () => Effect.succeed(undefined),
          retry: () => Effect.succeed(undefined),
          verify: () => Effect.succeed(undefined),
        },
        subagents: {
          getActive: () => Effect.succeed([]),
          list: () => Effect.succeed([]),
          stop: () => Effect.succeed(undefined),
        },
        hasSession: () => Effect.succeed(false),
        startPreviewSession: () => Effect.succeed(undefined),
        streamGoalDomainEvents: Stream.never,
        streamSubagentEvents: Stream.never,
        subscribeGoalEvents: () => Stream.never,
        subscribeSubagentEvents: () => Stream.never,
      }),
    listAdapters: () => [],
  } as any);
}

function getCaideSkillsDir(): string {
  const home = os.homedir();
  return path.join(home, ".caide", "skills");
}

function parseSkillMarkdown(fallbackName: string, filePath: string, raw: string): any {
  let name = fallbackName;
  let description = "";
  let displayName = formatModelName(fallbackName);
  let shortDescription = "";

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (kv) {
        const key = kv[1].trim().toLowerCase();
        let val = kv[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key === "name") name = val;
        else if (key === "description") description = val;
        else if (key === "displayname" || key === "display_name") displayName = val;
        else if (key === "shortdescription" || key === "short_description") shortDescription = val;
      }
    }
  }

  if (!description) {
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
    const lines = body.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
    description = lines[0]?.slice(0, 140) ?? "";
  }

  return {
    name,
    description: description || `Custom skill: ${displayName}`,
    path: filePath,
    enabled: true,
    scope: "custom",
    interface: {
      displayName: displayName || name,
      shortDescription: shortDescription || description.slice(0, 80),
    },
  };
}

function loadCustomSkills(): any[] {
  const skillsDir = getCaideSkillsDir();
  try {
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
      return [];
    }
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const customSkills: any[] = [];
    for (const entry of entries) {
      try {
        if (entry.isDirectory()) {
          const skillFilePath = path.join(skillsDir, entry.name, "SKILL.md");
          const fallbackPath = path.join(skillsDir, entry.name, "skill.md");
          const target = fs.existsSync(skillFilePath)
            ? skillFilePath
            : fs.existsSync(fallbackPath)
              ? fallbackPath
              : null;
          if (target) {
            const content = fs.readFileSync(target, "utf-8");
            customSkills.push(parseSkillMarkdown(entry.name, target, content));
          }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const name = entry.name.replace(/\.md$/, "");
          const target = path.join(skillsDir, entry.name);
          const content = fs.readFileSync(target, "utf-8");
          customSkills.push(parseSkillMarkdown(name, target, content));
        }
      } catch (e) {
        console.warn(`[harness] Failed to load custom skill ${entry.name}:`, e);
      }
    }
    return customSkills;
  } catch (err) {
    console.warn("[harness] Failed to scan ~/.caide/skills:", err);
    return [];
  }
}

function saveCustomSkill(input: {
  name: string;
  displayName?: string;
  description?: string;
  content: string;
}): any {
  const skillsDir = getCaideSkillsDir();
  const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const skillFolder = path.join(skillsDir, slug);
  fs.mkdirSync(skillFolder, { recursive: true });
  const skillFilePath = path.join(skillFolder, "SKILL.md");

  const displayName = input.displayName?.trim() || formatModelName(slug);
  const description = input.description?.trim() || "";

  let finalContent = input.content.trim();
  if (!finalContent.startsWith("---")) {
    finalContent = [
      "---",
      `name: ${slug}`,
      `displayName: "${displayName}"`,
      description ? `description: "${description}"` : null,
      "---",
      "",
      finalContent,
    ]
      .filter((x) => x !== null)
      .join("\n");
  }

  fs.writeFileSync(skillFilePath, finalContent, "utf-8");

  return {
    name: slug,
    description: description || `Custom skill: ${displayName}`,
    path: skillFilePath,
    enabled: true,
    scope: "custom",
    interface: {
      displayName,
      shortDescription: description.slice(0, 80),
    },
  };
}

const HARNESS_SKILLS = [
  {
    name: "ui-ux-mastery",
    description: "Product archetypes, design system, component contracts, a11y, anti-slop, and motion direction",
    path: "harness/skills/ui-ux-mastery.md",
    enabled: true,
    scope: "system",
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
    scope: "system",
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
    scope: "system",
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
    scope: "system",
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
    scope: "system",
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
    scope: "system",
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
      name: "GPT-5.6 Sol",
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
      slug: "sonnet-5",
      name: "Claude Sonnet 5",
      description: "High intelligence and balanced aesthetic taste",
      supportsFastMode: true,
    },
    {
      slug: "opus-4.8",
      name: "Claude Opus 4.8",
      description: "Exceptional architecture, complex refactors, and design taste",
      supportsFastMode: true,
    },
    {
      slug: "fable-5",
      name: "Fable 5",
      description: "Top-tier intelligence and supreme product UI/UX taste",
      supportsFastMode: true,
    },
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
    {
      slug: "deepseek-r1",
      name: "DeepSeek R1",
      description: "Full reasoning and math model",
      supportsFastMode: true,
    },
    {
      slug: "deepseek-v3",
      name: "DeepSeek V3",
      description: "High-throughput general assistant",
      supportsFastMode: true,
    },
  ],
  opencodeGo: [
    {
      slug: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
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
      slug: "sonnet-5",
      name: "Claude Sonnet 5",
      description: "High intelligence and balanced aesthetic taste",
      supportsFastMode: true,
    },
    {
      slug: "opus-4.8",
      name: "Claude Opus 4.8",
      description: "Exceptional architecture, complex refactors, and design taste",
      supportsFastMode: true,
    },
    {
      slug: "fable-5",
      name: "Fable 5",
      description: "Top-tier intelligence and supreme product UI/UX taste",
      supportsFastMode: true,
    },
    {
      slug: "go-standard",
      name: "Go Standard",
      description: "Direct OpenCode Go standard model",
      supportsFastMode: true,
    },
    {
      slug: "go-fast",
      name: "Go Fast",
      description: "Ultra-fast low-latency OpenCode Go model",
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
    {
      slug: "claude-3-5-haiku-latest",
      name: "Claude 3.5 Haiku",
      description: "Fast, responsive light model",
      supportsFastMode: true,
    },
    {
      slug: "claude-3-opus-latest",
      name: "Claude 3 Opus",
      description: "Complex reasoning and creative generation",
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
      slug: "gpt-4o-mini",
      name: "GPT-4o Mini",
      description: "Fast, cost-efficient model",
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
    {
      slug: "o1",
      name: "o1",
      description: "Full depth reasoning model",
      supportsFastMode: true,
    },
    {
      slug: "gpt-4.5-preview",
      name: "GPT-4.5 Preview",
      description: "Next-gen flagship preview model",
      supportsFastMode: true,
    },
  ],
  google: [
    {
      slug: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "State-of-the-art coding and complex multimodal reasoning",
      supportsFastMode: true,
    },
    {
      slug: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "High-speed multimodal coding and inference",
      supportsFastMode: true,
    },
    {
      slug: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Fast next-gen multimodel",
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
    {
      slug: "deepseek-r1-distill-llama-70b",
      name: "DeepSeek R1 Distill 70B",
      description: "Reasoning distilled onto Llama architecture on Groq",
      supportsFastMode: true,
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

const OPENCODE_MODELS_CACHE: Record<string, { models: any[]; expiresAt: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

function formatModelName(id: string): string {
  if (id === "gpt-5.6-sol") return "GPT-5.6 Sol";
  if (id === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (id === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (id === "claude-fable-5") return "Claude Fable 5";
  if (id === "claude-opus-5") return "Claude Opus 5";
  if (id === "claude-sonnet-5") return "Claude Sonnet 5";
  if (id === "claude-opus-4-8") return "Claude Opus 4.8";
  if (id === "claude-opus-4-7") return "Claude Opus 4.7";
  if (id === "claude-opus-4-6") return "Claude Opus 4.6";
  if (id === "claude-opus-4-5") return "Claude Opus 4.5";
  if (id === "claude-sonnet-4-6") return "Claude Sonnet 4.6";
  if (id === "claude-sonnet-4-5") return "Claude Sonnet 4.5";
  if (id === "claude-3-7-sonnet-latest" || id === "claude-3.7-sonnet") return "Claude 3.7 Sonnet";
  if (id === "claude-3-5-sonnet-latest" || id === "claude-3.5-sonnet") return "Claude 3.5 Sonnet";
  if (id === "deepseek-r1") return "DeepSeek R1";
  if (id === "deepseek-v3") return "DeepSeek V3";
  if (id === "deepseek-v4-pro") return "DeepSeek V4 Pro";
  if (id === "deepseek-v4-flash") return "DeepSeek V4 Flash";
  if (id === "qwen3.7-max") return "Qwen 3.7 Max";
  if (id === "qwen3.8-max") return "Qwen 3.8 Max";
  if (id === "minimax-m3") return "MiniMax M3";
  if (id === "minimax-m2.7") return "MiniMax M2.7";
  if (id === "kimi-k3") return "Kimi K3";
  if (id === "kimi-k2.7-code") return "Kimi K2.7 Code";

  return id
    .split("-")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function modelToDescriptor(id: string): any {
  const supportsReasoning =
    id.includes("3-7") ||
    id.includes("3.7") ||
    id.includes("o3") ||
    id.includes("o1") ||
    id.includes("r1") ||
    id.includes("sol") ||
    id.includes("fable") ||
    id.includes("reasoning");

  return {
    slug: id,
    name: formatModelName(id),
    description: `OpenCode live model (${id})`,
    supportsFastMode: true,
    ...(supportsReasoning
      ? {
          supportedReasoningEfforts: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ],
          defaultReasoningEffort: "medium",
        }
      : {}),
  };
}

async function getDynamicOpenCodeModels(url: string, fallbackModels: any[]): Promise<any[]> {
  const now = Date.now();
  const cached = OPENCODE_MODELS_CACHE[url];
  if (cached && cached.expiresAt > now) {
    return cached.models;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    if (Array.isArray(json.data) && json.data.length > 0) {
      const dynamicList = json.data.map((m) => modelToDescriptor(m.id));
      const dynamicIds = new Set(dynamicList.map((m) => m.slug));
      const combined = [
        ...fallbackModels.filter((m) => dynamicIds.has(m.slug)),
        ...dynamicList.filter((m) => !fallbackModels.some((f) => f.slug === m.slug)),
        ...fallbackModels.filter((m) => !dynamicIds.has(m.slug)),
      ];
      OPENCODE_MODELS_CACHE[url] = { models: combined, expiresAt: now + CACHE_TTL_MS };
      return combined;
    }
  } catch (err) {
    console.warn(`[harness] Failed to fetch dynamic models from ${url}, using fallback:`, err);
  }

  return fallbackModels;
}

export class ProviderDiscoveryService extends ServiceMap.Service<ProviderDiscoveryService, any>()(
  "caide/ProviderDiscoveryService",
) {
  static readonly layer = Layer.succeed(this, {
    discover: () => Effect.succeed([]),
    listSkills: () =>
      Effect.sync(() => ({
        skills: [...HARNESS_SKILLS, ...loadCustomSkills()],
        source: "caide-harness",
        cached: false,
      })),
    listSkillsCatalog: () =>
      Effect.sync(() => ({
        skills: [...HARNESS_SKILLS, ...loadCustomSkills()],
        caideSkillsDir: getCaideSkillsDir(),
      })),
    createCustomSkill: (input: any) =>
      Effect.try({
        try: () => ({ skill: saveCustomSkill(input) }),
        catch: (err) => new Error(String(err)),
      }),
    listCommands: () => Effect.succeed({ commands: [], source: "empty", cached: true }),
    listModels: (input?: { provider?: string }) => {
      const provider = input?.provider ?? "opencodeZen";
      const fallback = DEFAULT_MODELS_BY_PROVIDER[provider] ?? DEFAULT_MODELS_BY_PROVIDER.opencodeZen;
      if (provider === "opencodeZen") {
        return Effect.tryPromise({
          try: () => getDynamicOpenCodeModels("https://opencode.ai/zen/v1/models", fallback),
          catch: () => fallback,
        }).pipe(
          Effect.map((models) => ({ models, source: "live-opencode-zen", cached: true })),
        );
      }
      if (provider === "opencodeGo") {
        return Effect.tryPromise({
          try: () => getDynamicOpenCodeModels("https://opencode.ai/zen/go/v1/models", fallback),
          catch: () => fallback,
        }).pipe(
          Effect.map((models) => ({ models, source: "live-opencode-go", cached: true })),
        );
      }
      return Effect.succeed({ models: fallback, source: "harness", cached: true });
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
        supportsNativeSlashCommandDiscovery: true,
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
    refresh: Effect.sync(() => {
      for (const k in OPENCODE_MODELS_CACHE) {
        delete OPENCODE_MODELS_CACHE[k];
      }
      return DEFAULT_PROVIDER_STATUSES;
    }),
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
