import * as child_process from "node:child_process";
import { randomUUID as nodeRandomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Layer, Option, PubSub, ServiceMap, Stream } from "effect";

export class AutomationService extends ServiceMap.Service<AutomationService, any>()(
  "caide/AutomationService",
) {
  static readonly layer = Layer.succeed(this, {
    list: () => Effect.succeed({ definitions: [], runs: [], memories: [] }),
    getMemory: () => Effect.succeed(null),
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

function sanitizeModelSelection(raw: any) {
  if (!raw) return null;
  let parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  if (!parsed || typeof parsed !== "object") return null;
  const validProviders = new Set([
    "engine",
    "openai",
    "anthropic",
    "google",
    "openrouter",
    "ollama",
    "deepseek",
    "groq",
    "mistral",
    "together",
    "cohere",
    "xai",
    "fireworks",
    "opencodeZen",
    "opencodeGo",
  ]);
  let provider = parsed.provider;
  if (!validProviders.has(provider)) {
    provider = "opencodeZen";
  }
  return {
    provider,
    model: parsed.model || "default",
    ...(parsed.customModelName ? { customModelName: parsed.customModelName } : {}),
  };
}

function sanitizeLatestTurn(raw: any) {
  if (!raw || typeof raw !== "object" || !raw.turnId) return null;
  let state = raw.state;
  if (state === "failed") state = "error";
  if (!["running", "interrupted", "completed", "error"].includes(state)) {
    state = "completed";
  }
  const now = new Date().toISOString();
  return {
    turnId: raw.turnId,
    state,
    requestedAt: raw.requestedAt || raw.startedAt || now,
    startedAt: raw.startedAt || null,
    completedAt: raw.completedAt || null,
    assistantMessageId: raw.assistantMessageId || null,
  };
}

function loadStateFromSqlite() {
  try {
    const sqlitePath = path.join(os.homedir(), ".caide/userdata/state.sqlite");
    if (!fs.existsSync(sqlitePath)) return;

    const query = (sql: string) => {
      try {
        const stdout = child_process.execSync(
          `sqlite3 "file:${sqlitePath}?immutable=1" -json ${JSON.stringify(sql)}`,
          { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );
        return stdout.trim() ? JSON.parse(stdout) : [];
      } catch {
        return [];
      }
    };

    const projects = query("SELECT * FROM projection_projects WHERE deleted_at IS NULL;");
    const threads = query("SELECT * FROM projection_threads WHERE deleted_at IS NULL;");
    const messages = query("SELECT * FROM projection_thread_messages;");
    const turns = query("SELECT * FROM projection_turns;");

    const messagesByThreadId = new Map<string, any[]>();
    for (const m of messages) {
      const list = messagesByThreadId.get(m.thread_id) ?? [];
      list.push({
        id: m.message_id,
        threadId: m.thread_id,
        turnId: m.turn_id ?? null,
        role: m.role || "user",
        text: m.text || "",
        streaming: Boolean(m.is_streaming),
        isStreaming: Boolean(m.is_streaming),
        createdAt: m.created_at || new Date().toISOString(),
        updatedAt: m.updated_at || new Date().toISOString(),
        source: m.source || "native",
        attachments: m.attachments_json
          ? (() => {
              try {
                return JSON.parse(m.attachments_json);
              } catch {
                return [];
              }
            })()
          : [],
        skills: m.skills_json
          ? (() => {
              try {
                return JSON.parse(m.skills_json);
              } catch {
                return [];
              }
            })()
          : [],
        mentions: m.mentions_json
          ? (() => {
              try {
                return JSON.parse(m.mentions_json);
              } catch {
                return [];
              }
            })()
          : [],
      });
      messagesByThreadId.set(m.thread_id, list);
    }

    const turnsByThreadId = new Map<string, any[]>();
    for (const t of turns) {
      const list = turnsByThreadId.get(t.thread_id) ?? [];
      list.push({
        turnId: t.turn_id,
        threadId: t.thread_id,
        state: t.state === "failed" ? "error" : t.state,
        status: t.state === "failed" ? "error" : t.state,
        requestedAt: t.requested_at || t.started_at || new Date().toISOString(),
        startedAt: t.started_at || null,
        completedAt: t.completed_at || null,
        assistantMessageId: t.assistant_message_id || null,
      });
      turnsByThreadId.set(t.thread_id, list);
    }

    for (const p of projects) {
      if (!inMemoryProjects.some((existing) => existing.id === p.project_id)) {
        inMemoryProjects.push({
          id: p.project_id,
          title: p.title || "Project",
          name: p.title || "Project",
          kind: p.kind || "project",
          workspaceRoot: p.workspace_root,
          cwd: p.workspace_root,
          framework: p.framework || "blank",
          scripts: p.scripts_json
            ? (() => {
                try {
                  return JSON.parse(p.scripts_json);
                } catch {
                  return [];
                }
              })()
            : [],
          defaultModelSelection: sanitizeModelSelection(p.default_model_selection_json),
          isPinned: Boolean(p.is_pinned),
          spaceId: p.space_id || null,
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
          deletedAt: null,
        });
      }
    }

    for (const t of threads) {
      if (!inMemoryThreads.some((existing) => existing.id === t.thread_id)) {
        const threadMessages = messagesByThreadId.get(t.thread_id) ?? [];
        const threadTurns = turnsByThreadId.get(t.thread_id) ?? [];
        const lastTurn = threadTurns[threadTurns.length - 1] ?? null;
        inMemoryThreads.push({
          id: t.thread_id,
          projectId: t.project_id,
          title: t.title || "Chat",
          modelSelection: sanitizeModelSelection(t.model_selection_json) || {
            provider: "opencodeZen",
            model: "default",
          },
          runtimeMode: t.runtime_mode || "full-access",
          interactionMode: t.interaction_mode || "default",
          envMode: t.env_mode || "local",
          branch: t.branch || null,
          worktreePath: t.worktree_path || null,
          workingDirectory: t.working_directory || null,
          associatedWorktreePath: t.associated_worktree_path || null,
          associatedWorktreeBranch: t.associated_worktree_branch || null,
          associatedWorktreeRef: t.associated_worktree_ref || null,
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
          latestTurn: lastTurn,
          latestUserMessageAt: t.latest_user_message_at || null,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          hasActionableProposedPlan: false,
          createdAt: t.created_at || new Date().toISOString(),
          updatedAt: t.updated_at || new Date().toISOString(),
          lastVisitedAt: t.updated_at || new Date().toISOString(),
          archivedAt: t.archived_at || null,
          settledAt: null,
          deletedAt: null,
          handoff: null,
          session: null,
          goal: null,
          goalPausedAt: null,
          pinnedMessages: [],
          turns: threadTurns,
          messages: threadMessages,
          activities: [],
          proposedPlans: [],
          turnDiffSummaries: [],
          checkpoints: [],
        });
      }
    }
  } catch (err) {
    console.error("[harnessCompat] Failed to load state from SQLite", err);
  }
}

function loadPersistedState() {
  try {
    loadStateFromSqlite();
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
              defaultModelSelection: sanitizeModelSelection(p.defaultModelSelection),
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
              modelSelection: sanitizeModelSelection(t.modelSelection) || {
                provider: "opencodeZen",
                model: "default",
              },
              runtimeMode: t.runtimeMode || "full-access",
              interactionMode: t.interactionMode || "default",
              envMode: t.envMode || "local",
              branch: t.branch || null,
              worktreePath: t.worktreePath || null,
              workingDirectory: t.workingDirectory || null,
              associatedWorktreePath: t.associatedWorktreePath || null,
              associatedWorktreeBranch: t.associatedWorktreeBranch || null,
              associatedWorktreeRef: t.associatedWorktreeRef || null,
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
              latestTurn: null,
              latestUserMessageAt: null,
              hasPendingApprovals: false,
              hasPendingUserInput: false,
              hasActionableProposedPlan: false,
              createdAt: t.createdAt || new Date().toISOString(),
              updatedAt: t.updatedAt || new Date().toISOString(),
              lastVisitedAt: t.lastVisitedAt || new Date().toISOString(),
              archivedAt: t.archivedAt || null,
              settledAt: null,
              deletedAt: null,
              handoff: null,
              session: null,
              goal: null,
              goalPausedAt: null,
              pinnedMessages: [],
              turns: t.turns || [],
              messages: t.messages || [],
              activities: t.activities || [],
              proposedPlans: t.proposedPlans || [],
              turnDiffSummaries: t.turnDiffSummaries || [],
              checkpoints: [],
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
          let existingProject = inMemoryProjects.find(
            (p) => p.workspaceRoot === appPath || p.name === appName || p.title === appName,
          );
          const pid = existingProject ? existingProject.id : `project-${appName}`;
          const tid = `thread-${appName}`;
          const now = new Date().toISOString();

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
            existingProject = {
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
            };
            inMemoryProjects.push(existingProject);
          }

          if (!inMemoryThreads.some((t) => t.projectId === pid || t.id === tid)) {
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
              latestTurn: null,
              latestUserMessageAt: null,
              hasPendingApprovals: false,
              hasPendingUserInput: false,
              hasActionableProposedPlan: false,
              createdAt: now,
              updatedAt: now,
              lastVisitedAt: now,
              archivedAt: null,
              settledAt: null,
              deletedAt: null,
              handoff: null,
              session: null,
              goal: null,
              goalPausedAt: null,
              pinnedMessages: [],
              turns: [],
              messages: [],
              activities: [],
              proposedPlans: [],
              turnDiffSummaries: [],
              checkpoints: [],
            });
          }
        }
      }
    }

    const homeDir = process.env.HOME || "/home/DejiTech";
    const hasHomeProject = inMemoryProjects.some(
      (p) => p.kind === "chat" || p.id === "default" || p.workspaceRoot === homeDir,
    );
    if (!hasHomeProject) {
      inMemoryProjects.unshift({
        id: "default",
        title: "Home",
        name: "Home",
        kind: "chat",
        workspaceRoot: homeDir,
        cwd: homeDir,
        framework: "blank",
        scripts: [],
        defaultModelSelection: null,
        isPinned: false,
        spaceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
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
  projects: inMemoryProjects.map((p) => ({
    id: p.id,
    title: p.title || "Project",
    name: p.title || "Project",
    kind: p.kind || "project",
    workspaceRoot: p.workspaceRoot,
    framework: p.framework || "blank",
    scripts: p.scripts || [],
    defaultModelSelection: sanitizeModelSelection(p.defaultModelSelection),
    isPinned: Boolean(p.isPinned),
    spaceId: p.spaceId || null,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
    deletedAt: p.deletedAt || null,
  })),
  threads: inMemoryThreads.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title || "Chat",
    modelSelection: sanitizeModelSelection(t.modelSelection) || {
      provider: "opencodeZen",
      model: "default",
    },
    runtimeMode: t.runtimeMode || "full-access",
    interactionMode: t.interactionMode || "default",
    envMode: t.envMode || "local",
    branch: t.branch || null,
    worktreePath: t.worktreePath || null,
    workingDirectory: t.workingDirectory || null,
    associatedWorktreePath: t.associatedWorktreePath || null,
    associatedWorktreeBranch: t.associatedWorktreeBranch || null,
    associatedWorktreeRef: t.associatedWorktreeRef || null,
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
    latestTurn: sanitizeLatestTurn(t.latestTurn),
    latestUserMessageAt: t.latestUserMessageAt || null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString(),
    lastVisitedAt: t.lastVisitedAt || new Date().toISOString(),
    archivedAt: t.archivedAt || null,
    settledAt: null,
    deletedAt: null,
    handoff: null,
    session: null,
    goal: null,
    goalPausedAt: null,
    pinnedMessages: t.pinnedMessages || [],
    turns: t.turns || [],
    messages: (t.messages || []).map((m: any) => ({
      id: m.id || m.message_id,
      role: m.role || "user",
      text: m.text || "",
      turnId: m.turnId ?? m.turn_id ?? null,
      streaming: Boolean(m.streaming ?? m.is_streaming),
      source: m.source || "native",
      createdAt: m.createdAt || m.created_at || new Date().toISOString(),
      updatedAt: m.updatedAt || m.updated_at || new Date().toISOString(),
      attachments: m.attachments ?? [],
      skills: m.skills ?? [],
      mentions: m.mentions ?? [],
      dispatchMode: m.dispatchMode ?? "queue",
    })),
    activities: t.activities || [],
    proposedPlans: t.proposedPlans || [],
    turnDiffSummaries: t.turnDiffSummaries || [],
    checkpoints: t.checkpoints || [],
  })),
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid empty shell snapshot (same required fields)
const emptyShellSnapshot = () => ({
  snapshotSequence: globalSnapshotSequence,
  spaces: [],
  projects: inMemoryProjects.map((p) => ({
    id: p.id,
    title: p.title || "Project",
    name: p.title || "Project",
    kind: p.kind || "project",
    workspaceRoot: p.workspaceRoot,
    framework: p.framework || "blank",
    scripts: p.scripts || [],
    defaultModelSelection: sanitizeModelSelection(p.defaultModelSelection),
    isPinned: Boolean(p.isPinned),
    spaceId: p.spaceId || null,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  })),
  threads: inMemoryThreads.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title || "Chat",
    modelSelection: sanitizeModelSelection(t.modelSelection) || {
      provider: "opencodeZen",
      model: "default",
    },
    runtimeMode: t.runtimeMode || "full-access",
    interactionMode: t.interactionMode || "default",
    envMode: t.envMode || "local",
    branch: t.branch || null,
    worktreePath: t.worktreePath || null,
    workingDirectory: t.workingDirectory || null,
    associatedWorktreePath: t.associatedWorktreePath || null,
    associatedWorktreeBranch: t.associatedWorktreeBranch || null,
    associatedWorktreeRef: t.associatedWorktreeRef || null,
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
    latestTurn: sanitizeLatestTurn(t.latestTurn),
    latestUserMessageAt: t.latestUserMessageAt || null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString(),
    lastVisitedAt: t.lastVisitedAt || new Date().toISOString(),
    archivedAt: t.archivedAt || null,
    settledAt: null,
    handoff: null,
    session: null,
    goal: null,
    goalPausedAt: null,
  })),
  updatedAt: new Date().toISOString(),
});

// Returns schema-valid thread detail snapshot
const emptyThreadDetailSnapshot = (threadId: string) => {
  let existing = inMemoryThreads.find((t) => t.id === threadId);
  const now = new Date().toISOString();
  if (!existing) {
    existing = {
      id: threadId,
      projectId: "default",
      title: "New Chat",
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
      latestTurn: null,
      latestUserMessageAt: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
      archivedAt: null,
      settledAt: null,
      deletedAt: null,
      handoff: null,
      session: null,
      goal: null,
      goalPausedAt: null,
      pinnedMessages: [],
      turns: [],
      messages: [],
      activities: [],
      proposedPlans: [],
      turnDiffSummaries: [],
      checkpoints: [],
    };
    inMemoryThreads.push(existing);
    globalSnapshotSequence += 1;
    savePersistedState();
  }
  return {
    snapshotSequence: globalSnapshotSequence,
    thread: {
      id: threadId,
      projectId: existing.projectId ?? "default",
      title: existing.title ?? "New Chat",
      modelSelection: sanitizeModelSelection(existing.modelSelection) ?? {
        provider: "opencodeZen",
        model: "default",
      },
      runtimeMode: existing.runtimeMode ?? "full-access",
      interactionMode: existing.interactionMode ?? "default",
      envMode: existing.envMode ?? "local",
      branch: existing.branch ?? null,
      worktreePath: existing.worktreePath ?? null,
      workingDirectory: existing.workingDirectory ?? null,
      associatedWorktreePath: existing.associatedWorktreePath ?? null,
      associatedWorktreeBranch: existing.associatedWorktreeBranch ?? null,
      associatedWorktreeRef: existing.associatedWorktreeRef ?? null,
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
      latestTurn: sanitizeLatestTurn(existing.latestTurn),
      latestUserMessageAt: existing.latestUserMessageAt ?? null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
      createdAt: existing.createdAt ?? now,
      updatedAt: existing.updatedAt ?? now,
      lastVisitedAt: existing.lastVisitedAt ?? now,
      archivedAt: existing.archivedAt ?? null,
      settledAt: null,
      deletedAt: null,
      handoff: null,
      session: null,
      goal: null,
      goalPausedAt: null,
      pinnedMessages: existing.pinnedMessages ?? [],
      turns: existing.turns ?? [],
      messages: (existing.messages ?? []).map((m: any) => ({
        id: m.id || m.message_id,
        role: m.role || "user",
        text: m.text || "",
        turnId: m.turnId ?? m.turn_id ?? null,
        streaming: Boolean(m.streaming ?? m.is_streaming),
        source: m.source || "native",
        createdAt: m.createdAt || m.created_at || now,
        updatedAt: m.updatedAt || m.updated_at || now,
        attachments: m.attachments ?? [],
        skills: m.skills ?? [],
        mentions: m.mentions ?? [],
      })),
      activities: existing.activities ?? [],
      proposedPlans: existing.proposedPlans ?? [],
      turnDiffSummaries: existing.turnDiffSummaries ?? [],
      checkpoints: existing.checkpoints ?? [],
    },
  };
};

const domainEventsPubSub = Effect.runSync(PubSub.unbounded<any>());
const goalEventsPubSub = Effect.runSync(PubSub.unbounded<any>());
const subagentEventsPubSub = Effect.runSync(PubSub.unbounded<any>());
const eventLog: any[] = [];

export function publishDomainEvent(event: any) {
  // The renderer decodes every domain event against the OrchestrationEvent
  // contract (EventBaseFields: eventId, occurredAt, commandId, causationEventId,
  // correlationId, metadata). The stub used to emit only {sequence, aggregateKind,
  // aggregateId, type, payload, createdAt}, which failed to decode with "Missing
  // key" on the shell/thread streams — killing the connection and causing a
  // reconnect churn. Fill the required base fields here so every emitted event
  // is schema-valid.
  const now = new Date().toISOString();
  const fullEvent = {
    sequence: event.sequence,
    eventId: event.eventId ?? nodeRandomUUID(),
    aggregateKind: event.aggregateKind,
    aggregateId: event.aggregateId,
    occurredAt: event.occurredAt ?? event.createdAt ?? now,
    commandId: event.commandId ?? null,
    causationEventId: event.causationEventId ?? null,
    correlationId: event.correlationId ?? null,
    metadata: event.metadata ?? {},
    type: event.type,
    payload: event.payload,
  };
  eventLog.push(fullEvent);
  if (eventLog.length > 5000) {
    eventLog.splice(0, eventLog.length - 5000);
  }
  Effect.runSync(PubSub.publish(domainEventsPubSub, fullEvent));
}

// Build a schema-valid `thread.message-sent` payload. The stub's in-memory
// message objects carry the id as `id` and nest fields, but the contract's
// ThreadMessageSentPayload expects them flat at the top level.
function messageSentPayload(threadId: string, msg: any): any {
  const now = new Date().toISOString();
  return {
    threadId,
    messageId: msg.id,
    role: msg.role,
    text: msg.text ?? "",
    ...(msg.attachments !== undefined ? { attachments: msg.attachments } : {}),
    ...(msg.skills !== undefined ? { skills: msg.skills } : {}),
    ...(msg.mentions !== undefined ? { mentions: msg.mentions } : {}),
    ...(msg.dispatchMode !== undefined ? { dispatchMode: msg.dispatchMode } : {}),
    turnId: msg.turnId ?? null,
    streaming: Boolean(msg.streaming),
    source: msg.source ?? "native",
    createdAt: msg.createdAt ?? now,
    updatedAt: msg.updatedAt ?? now,
  };
}

// Build a schema-valid `thread.meta-updated` payload.
function threadMetaUpdatedPayload(
  threadId: string,
  fields: { title?: string; runtimeMode?: string; interactionMode?: string } = {},
): any {
  const now = new Date().toISOString();
  return {
    threadId,
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    ...(fields.runtimeMode !== undefined ? { runtimeMode: fields.runtimeMode } : {}),
    ...(fields.interactionMode !== undefined ? { interactionMode: fields.interactionMode } : {}),
    updatedAt: now,
  };
}

// The core harness tools the builder agent can call. Kept in the system
// prompt so the model actually knows it has tools (the user's core complaint).
// Includes readOnly vs modifiesState hint so the model knows ASK can still READ.
const CORE_TOOLS_TEXT = [
  "read_file(path) [readOnly]",
  "write_file(path, content) [write]",
  "list_dir(path) [readOnly]",
  "search_files(pattern, dir) [readOnly]",
  "run_command(cmd, args, cwd) [write]",
  "read_url(url) [readOnly]",
  "screenshot(selector?) [readOnly]",
  "get_design_tokens() [readOnly]",
  "read_spec() [readOnly]",
  "write_spec(spec) [write]",
  "write_design_spec(spec) [write]",
  "write_motion_spec(spec) [write]",
  "install_package(name) [write]",
  "build_project() [write]",
  "lint_project() [readOnly]",
  "test_project() [readOnly]",
  "get_preview_url() [readOnly]",
  "checkpoint(reason, diff) [write]",
  "log_decision(decision, reason) [write]",
  "spawn_subagent(task, context?) [readOnly]",
].join("\n- ");

const FRAMEWORK_SHORT: Record<string, string> = {
  "react-native": "react-native (Expo + NativeWind, device-frame preview via npx expo start --web)",
  website: "website (Vite + React + Tailwind, browser preview via bun run dev)",
  flutter: "flutter (Riverpod + GoRouter, device-frame via flutter run -d web-server)",
  blank: "blank (no preview)",
};

/**
 * Builds the agent's system prompt for a turn. Mode-aware (ask/plan/build) and
 * framework-aware (rn/web/flutter/blank), and it tells the agent which tools it
 * has. Uses the harness prompt assembler (L0 identity + L1 role + L2 stage +
 * L3 skills) when available, with a safe fallback.
 */
async function buildSystemPrompt(
  mode: string | undefined,
  framework: string,
  skills: string[],
): Promise<string> {
  const normalizedMode = mode === "plan" ? "plan" : mode === "ask" ? "ask" : "build";
  let rolePrompt = "";
  if (normalizedMode !== "ask") {
    try {
      const { assemblePrompt, loadSkillContent } = await import("./harness/prompts/assembler.ts");
      // Load the actual skill content so the guidance reaches the model, not
      // just the pack names. Fall back to the name if content is unavailable.
      const skillContents = skills.map((name) => {
        const content = loadSkillContent(name);
        return content && content.length > 0 ? `## Skill Pack: ${name}\n\n${content}` : name;
      });
      rolePrompt = assemblePrompt({
        role: normalizedMode === "plan" ? "planner" : "builder",
        stage: "generating",
        framework,
        skills: skillContents,
        vars: {},
      });
    } catch {
      rolePrompt = `You are Caide's ${normalizedMode === "plan" ? "planner" : "builder"} for a ${framework} app.`;
    }
  }
  const frameworkShort = FRAMEWORK_SHORT[framework] ?? FRAMEWORK_SHORT.blank;
  const slashHelp = `User slash commands (client-side, you don't call them): /clear (new thread), /plan (plan mode), /default (build mode), /debug, /model, /compact, /status, /export, /fork, /side, /review, /doctor, /test, /analyze, /build, /preview, /theme, /goal, /spawn, /init, /btw, /learn, /commands, /help — they are handled by the UI. If user typed /plan, you are already in PLAN; if they typed /clear, context is fresh.`;
  const greetingRule = `For casual greetings like "hey", "hi", "hello" without a build request, respond with a friendly short greeting and ask what they would like to build — do not call tools.`;
  const buildRule = `When the user requests a build, immediately start building: call list_dir to inspect workspace, call write_file to create or update files with complete code, run_command for dependency installs, and build_project to verify. Never use empty path "" or "." for write_file. Always provide complete code without placeholders.`;
  const modeDirective =
    normalizedMode === "ask"
      ? `You are in ASK mode for ${framework} (${frameworkShort}). Answer for THIS framework only — if asked "what can you build?" list only ${framework} capabilities, not all frameworks. You have READ-ONLY tools available (read_file, list_dir, search_files, read_url, get_design_tokens, read_spec, get_preview_url, screenshot, lint_project, test_project, spawn_subagent) — use them if you need to inspect files to answer. Do NOT write code or modify files unless the user explicitly asks.\n${slashHelp}\nTools:\n- ${CORE_TOOLS_TEXT}`
      : normalizedMode === "plan"
        ? `You are in PLAN mode for ${framework} (${frameworkShort}). Create a plan/spec before writing application code for THIS framework only. You have full tools — use write_spec, write_design_spec, write_motion_spec, checkpoint, log_decision, plus read tools to inspect workspace.\n${slashHelp}\nTools:\n- ${CORE_TOOLS_TEXT}`
        : `You are in BUILD mode for ${framework} (${frameworkShort}). ${greetingRule} ${buildRule}\n${slashHelp}\nTools:\n- ${CORE_TOOLS_TEXT}\n\nTool rules: always read before write; call write_file for code, run_command for installs/builds, get_preview_url to get preview URL, screenshot to verify, spawn_subagent for heavy parallel subtasks.`;
  return `${rolePrompt}\n\n${modeDirective}`.trim();
}

export class OrchestrationEngineService extends ServiceMap.Service<
  OrchestrationEngineService,
  any
>()("caide/OrchestrationEngineService") {
  static readonly layer = Layer.succeed(this, {
    getEventHighWaterSequence: Effect.sync(() => globalSnapshotSequence),
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
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "project",
              aggregateId: command.projectId,
              type: "project.created",
              payload: {
                projectId: command.projectId,
                title: command.title ?? "Home",
                workspaceRoot: command.workspaceRoot ?? "",
                defaultModelSelection: command.defaultModelSelection ?? null,
                scripts: command.scripts ?? [],
                isPinned: false,
                spaceId: command.spaceId ?? null,
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
            });
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
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "project",
              aggregateId: command.projectId,
              type: "project.meta-updated",
              payload: {
                projectId: command.projectId,
                ...(command.title !== undefined ? { title: command.title } : {}),
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "project.delete") {
          const index = inMemoryProjects.findIndex((p) => p.id === command.projectId);
          if (index !== -1) {
            inMemoryProjects.splice(index, 1);
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "project",
              aggregateId: command.projectId,
              type: "project.deleted",
              payload: { projectId: command.projectId, deletedAt: now },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.create") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (!existing) {
            inMemoryThreads.push({
              id: command.threadId,
              projectId: command.projectId,
              title: command.title ?? "New Chat",
              modelSelection: command.modelSelection ?? {
                provider: "opencodeZen",
                model: "default",
              },
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
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.meta-updated",
              payload: threadMetaUpdatedPayload(command.threadId, { title: command.title }),
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.meta.update") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (existing) {
            if (command.title !== undefined) existing.title = command.title;
            existing.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.meta-updated",
              payload: threadMetaUpdatedPayload(command.threadId, { title: command.title }),
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.archive") {
          const existing = inMemoryThreads.find((t) => t.id === command.threadId);
          if (existing) {
            existing.archivedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.archived",
              payload: { threadId: command.threadId, archivedAt: now, updatedAt: now },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.delete") {
          const index = inMemoryThreads.findIndex((t) => t.id === command.threadId);
          if (index !== -1) {
            inMemoryThreads.splice(index, 1);
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.deleted",
              payload: { threadId: command.threadId, deletedAt: now },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.pinned-message.add") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            if (!thread.pinnedMessages) thread.pinnedMessages = [];
            const pin = {
              messageId: command.messageId,
              label: null,
              done: false,
              pinnedAt: now,
            };
            const existingPinIdx = thread.pinnedMessages.findIndex(
              (p: any) => p.messageId === command.messageId,
            );
            if (existingPinIdx >= 0) {
              thread.pinnedMessages[existingPinIdx] = pin;
            } else {
              thread.pinnedMessages.push(pin);
            }
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.pinned-message-added",
              payload: {
                threadId: command.threadId,
                pin,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.pinned-message.remove") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.pinnedMessages) {
            thread.pinnedMessages = thread.pinnedMessages.filter(
              (p: any) => p.messageId !== command.messageId,
            );
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.pinned-message-removed",
              payload: {
                threadId: command.threadId,
                messageId: command.messageId,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.pinned-message.done.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.pinnedMessages) {
            const pin = thread.pinnedMessages.find((p: any) => p.messageId === command.messageId);
            if (pin) pin.done = Boolean(command.done);
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.pinned-message-done-set",
              payload: {
                threadId: command.threadId,
                messageId: command.messageId,
                done: Boolean(command.done),
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.pinned-message.label.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.pinnedMessages) {
            const pin = thread.pinnedMessages.find((p: any) => p.messageId === command.messageId);
            if (pin) pin.label = command.label ?? null;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.pinned-message-label-set",
              payload: {
                threadId: command.threadId,
                messageId: command.messageId,
                label: command.label ?? null,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.marker.add") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            if (!thread.threadMarkers) thread.threadMarkers = [];
            const marker = {
              id: command.markerId,
              messageId: command.messageId,
              startOffset: command.startOffset,
              endOffset: command.endOffset,
              selectedText: command.selectedText,
              style: command.style ?? "highlight",
              color: command.color ?? "yellow",
              done: false,
              label: null,
              createdAt: now,
              updatedAt: now,
            };
            thread.threadMarkers.push(marker);
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.marker-added",
              payload: {
                threadId: command.threadId,
                marker,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.marker.remove") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.threadMarkers) {
            thread.threadMarkers = thread.threadMarkers.filter(
              (m: any) => m.markerId !== command.markerId,
            );
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.marker-removed",
              payload: {
                threadId: command.threadId,
                markerId: command.markerId,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.marker.done.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.threadMarkers) {
            const marker = thread.threadMarkers.find((m: any) => m.markerId === command.markerId);
            if (marker) marker.done = Boolean(command.done);
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.marker-done-set",
              payload: {
                threadId: command.threadId,
                markerId: command.markerId,
                done: Boolean(command.done),
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.marker.label.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread && thread.threadMarkers) {
            const marker = thread.threadMarkers.find((m: any) => m.markerId === command.markerId);
            if (marker) marker.label = command.label ?? null;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.marker-label-set",
              payload: {
                threadId: command.threadId,
                markerId: command.markerId,
                label: command.label ?? null,
                updatedAt: now,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.runtime-mode.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            thread.runtimeMode = command.runtimeMode;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.runtime-mode-set",
              payload: {
                threadId: command.threadId,
                runtimeMode: command.runtimeMode,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.interaction-mode.set") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            thread.interactionMode = command.interactionMode;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.interaction-mode-set",
              payload: {
                threadId: command.threadId,
                interactionMode: command.interactionMode,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.turn.interrupt") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            if (thread.latestTurn) {
              thread.latestTurn.state = "interrupted";
              thread.latestTurn.status = "interrupted";
            }
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.turn-interrupt-requested",
              payload: {
                threadId: command.threadId,
                turnId: command.turnId ?? thread.latestTurn?.turnId,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.session.stop") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            thread.session = null;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.session-stop-requested",
              payload: {
                threadId: command.threadId,
              },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.unarchive") {
          const thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (thread) {
            thread.archivedAt = null;
            thread.updatedAt = now;
            globalSnapshotSequence += 1;
            savePersistedState();
            publishDomainEvent({
              sequence: globalSnapshotSequence,
              aggregateKind: "thread",
              aggregateId: command.threadId,
              type: "thread.unarchived",
              payload: { threadId: command.threadId, unarchivedAt: now, updatedAt: now },
              createdAt: now,
            });
          }
        } else if (command?.type === "thread.turn.start") {
          let thread = inMemoryThreads.find((t) => t.id === command.threadId);
          if (!thread) {
            thread = {
              id: command.threadId,
              projectId: command.projectId ?? "default",
              title: "New Chat",
              modelSelection: command.modelSelection ?? {
                provider: "opencodeZen",
                model: "default",
              },
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
            dispatchMode: command.dispatchMode ?? "queue",
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

          publishDomainEvent({
            sequence: globalSnapshotSequence,
            aggregateKind: "thread",
            aggregateId: command.threadId,
            type: "thread.message-sent",
            payload: messageSentPayload(command.threadId, userMsg),
            createdAt: now,
          });

          publishDomainEvent({
            sequence: globalSnapshotSequence,
            aggregateKind: "thread",
            aggregateId: command.threadId,
            type: "thread.message-sent",
            payload: messageSentPayload(command.threadId, assistantMsg),
            createdAt: now,
          });

          // Spawn background LLM streaming execution
          void (async () => {
            try {
              const { streamProvider } = await import("./harness/provider/apiAdapter.ts");
              const modelSelection = command.modelSelection ||
                thread.modelSelection || { provider: "opencodeZen", model: "gpt-5.6-sol" };
              let provider = modelSelection.provider || "opencodeZen";
              const modelId =
                modelSelection.model && modelSelection.model !== "default"
                  ? modelSelection.model
                  : "gpt-5.6-sol";

              const GO_MODELS = new Set([
                "grok-4.6",
                "gpt-5.6-luna",
                "glm-5.3-flash",
                "glm-5.3",
                "glm-5.2",
                "glm-5.1",
                "kimi-k3",
                "kimi-k2.7-code",
                "kimi-k2.6",
                "longcat-2.0",
                "deepseek-v4-pro",
                "deepseek-v4-flash",
                "deepseek-v4-flash-vision-exp",
                "mimo-v2.5",
                "mimo-v2.5-pro",
                "minimax-m3",
                "minimax-m2.7",
                "minimax-m2.5",
                "muse-spark-1.2-contributor",
                "qwen3.8-max",
                "qwen3.8-flash",
                "qwen3.7-max",
                "qwen3.7-plus",
                "qwen3.6-plus",
                "hy4-preview",
                "hy3",
              ]);

              let baseUrl = "https://opencode.ai/zen/v1";
              if (provider === "opencodeGo" || (provider !== "groq" && GO_MODELS.has(modelId))) {
                baseUrl = "https://opencode.ai/zen/go/v1";
                provider = "opencodeGo";
              } else if (provider === "groq") {
                baseUrl = "https://api.groq.com/openai/v1";
              }

              let apiKey = getProviderApiKeyDirect(provider);
              if (!apiKey && provider === "opencodeGo") {
                apiKey = getProviderApiKeyDirect("opencodeZen");
              } else if (!apiKey && provider === "opencodeZen") {
                apiKey = getProviderApiKeyDirect("opencodeGo");
              }

              const chatHistory = thread.messages
                .filter((m: any) => m.id !== assistantMsgId && m.text)
                .map((m: any) => ({
                  role: m.role === "assistant" ? "assistant" : "user",
                  content: m.text,
                }));

              const project = inMemoryProjects.find((p: any) => p.id === thread.projectId);
              const framework = project?.framework ?? "blank";
              let skills: string[] = [];
              try {
                const { getFrameworkConfig } = await import("./harness/framework/registry.ts");
                skills = getFrameworkConfig(framework)?.skills ?? [];
              } catch {
                // framework registry unavailable — build without skills
              }
              const system = await buildSystemPrompt(command.mode, framework, skills);

              const appPath = project?.workspaceRoot ?? process.cwd();

              // Conversation for the harness loop. The system prompt rides the
              // adapter's `system` option; the rest is the real history.
              const conversation = [
                { role: "system", content: system },
                ...chatHistory.map((m: any) => ({ role: m.role, content: m.content })),
              ];

              const { createStreamProviderAdapter } =
                await import("./harness/provider/streamProviderAdapter.ts");
              const { ALL_CORE_TOOLS } = await import("./harness/tools/coreTools.ts");
              const { runLoop } = await import("./harness/loop/loop.ts");

              const adapter = createStreamProviderAdapter(
                { modelId, baseUrl, apiKey: apiKey || "dummy-key", system, appPath },
                ALL_CORE_TOOLS,
              );

              const loopToolDefinitions = ALL_CORE_TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                readOnly: t.readOnly,
                execute: (args: any, ctx: any) =>
                  t.execute(args, {
                    signal: ctx.signal,
                    appPath,
                    sessionId: ctx.sessionId,
                    toolId: ctx.toolId,
                    provider: { modelId, baseUrl, apiKey: apiKey || "dummy-key", system },
                  }),
              }));

              const publishAssistantMessage = (msg: any) => {
                globalSnapshotSequence += 1;
                publishDomainEvent({
                  sequence: globalSnapshotSequence,
                  aggregateKind: "thread",
                  aggregateId: command.threadId,
                  type: "thread.message-sent",
                  payload: messageSentPayload(command.threadId, msg),
                  createdAt: new Date().toISOString(),
                });
              };

              let stepAssistantText = "";

              const loop = runLoop({
                sessionId: thread.id,
                turnId,
                maxSteps: 10,
                llm: adapter,
                tools: loopToolDefinitions,
                buildMessages: () => conversation,
                onEvent: (event: any) => {
                  if (event.type === "token" && event.content) {
                    // If this token completes a <caide-write> tag, execute it immediately (dyad-style)
                    // so tools work even when structured function_call is missed (seen as {"path":""} leak)
                    const tentativeText = assistantMsg.text + event.content;
                    const hasCompleteTag = /<\/(?:caide|dyad)-write>/i.test(tentativeText);
                    const hasLeakedJson = /\{\s*"path"\s*:\s*".*?"\s*(?:,\s*"content")?/.test(tentativeText);
                    if (hasCompleteTag || hasLeakedJson) {
                      // Try to extract and execute any complete <caide-write> tags now, not just after loop
                      try {
                        const tagRe2 = /<(?:caide|dyad)-write[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/(?:caide|dyad)-write>/gi;
                        let m2: RegExpExecArray | null;
                        const alreadyExecuted = new Set<string>();
                        // Collect already executed paths from conversation to avoid double-write
                        for (const msg of conversation) {
                          if (typeof msg.content === "string" && msg.content.includes("[Tool call:")) {
                            const pm = /\[Tool call: write_file\((.*?)\)\]/.exec(msg.content);
                            if (pm) {
                              try {
                                const args = JSON.parse(pm[1] ?? "{}");
                                if (args.path) alreadyExecuted.add(args.path);
                              } catch {}
                            }
                          }
                        }
                        while ((m2 = tagRe2.exec(tentativeText)) !== null) {
                          const p = (m2[1] ?? "").trim();
                          let c = m2[2] ?? "";
                          const lines = c.split("\n");
                          if (lines[0]?.trim().startsWith("```")) lines.shift();
                          if (lines[lines.length - 1]?.trim().startsWith("```")) lines.pop();
                          c = lines.join("\n").trim();
                          if (p && c && !alreadyExecuted.has(p) && p !== "." && p !== "/" && p !== "") {
                            alreadyExecuted.add(p);
                            // Fire-and-forget write, but also push to conversation so next LLM turn sees it
                            import("./harness/tools/coreTools.ts").then(({ writeFileTool }) => {
                              writeFileTool
                                .execute(
                                  { path: p, content: c },
                                  {
                                    signal: new AbortController().signal,
                                    appPath,
                                    sessionId: thread.id,
                                    toolId: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                  } as any,
                                )
                                .catch(() => {});
                            });
                            // Also push to conversation as if it were a tool call, so model knows it succeeded
                            conversation.push({
                              role: "assistant",
                              content: `Wrote ${p} via <caide-write>`,
                              tool_calls: [
                                {
                                  id: `tag-${p}`,
                                  type: "function",
                                  function: { name: "write_file", arguments: JSON.stringify({ path: p, content: c.slice(0, 200) + "..." }) },
                                },
                              ],
                            } as any);
                            conversation.push({
                              role: "tool",
                              tool_call_id: `tag-${p}`,
                              content: JSON.stringify({ path: p, bytesWritten: c.length }),
                            } as any);
                          }
                        }
                      } catch {}
                    }
                    // Dedupe: if this token chunk is already at the tail, skip it
                    const tail = assistantMsg.text.slice(-event.content.length);
                    if (tail === event.content) {
                      // exact duplicate chunk, skip
                    } else if (
                      event.content.length > 20 &&
                      assistantMsg.text.endsWith(event.content.slice(0, 20))
                    ) {
                      // likely repeated sentence start, skip
                    } else {
                      stepAssistantText += event.content;
                      assistantMsg.text += event.content;
                      assistantMsg.updatedAt = new Date().toISOString();
                      // Strip leaked {"path":""} immediately so user never sees it (like dyad strips tags from display)
                      if (/\{\s*"path"\s*:\s*"\.?"\s*(?:,\s*"content")?/.test(assistantMsg.text)) {
                        assistantMsg.text = assistantMsg.text
                          .replace(/\{\s*"path"\s*:\s*"\.?"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
                          .replace(/\{\s*"path"\s*:\s*"[^"]*"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
                          .trim();
                      }
                      // Also strip completed <caide-write> tags from display text (dyad does this — tags are not shown, only the "Applied" marker)
                      if (/<\/(?:caide|dyad)-write>/i.test(assistantMsg.text)) {
                        const stripped = assistantMsg.text
                          .replace(/<(?:caide|dyad)-write[^>]*>[\s\S]*?<\/(?:caide|dyad)-write>/gi, "")
                          .replace(/\n{3,}/g, "\n\n")
                          .trim();
                        if (stripped !== assistantMsg.text) {
                          const lastTagPath = (() => {
                            const re = /<(?:caide|dyad)-write[^>]*path="([^"]+)"[^>]*>/gi;
                            let last = "";
                            let mm: RegExpExecArray | null;
                            while ((mm = re.exec(assistantMsg.text)) !== null) last = mm[1] ?? "";
                            return last;
                          })();
                          assistantMsg.text = stripped + (lastTagPath ? `\n\n✅ Wrote ${lastTagPath}` : "");
                        }
                      }
                      publishAssistantMessage(assistantMsg);
                    }
                  } else if (event.type === "tool_call") {
                    if (event.status === "started") {
                      // Don't push the full stepAssistantText again if it was already
                      // streamed to the user — push a concise tool_call history
                      // that the LLM will see as proper tool history, not text.
                      // Keep it lean to avoid confusing the model to repeat intro.
                      const trimmedReasoning = stepAssistantText.slice(-500).trim();
                      conversation.push({
                        role: "assistant",
                        content: trimmedReasoning ? trimmedReasoning : `Calling ${event.name}`,
                        tool_calls: [
                          {
                            id: event.id,
                            type: "function",
                            function: { name: event.name, arguments: JSON.stringify(event.args ?? {}) },
                          },
                        ],
                      } as any);
                      stepAssistantText = "";
                    } else if (event.status === "completed" || event.status === "failed") {
                      const resultText =
                        typeof event.result === "string"
                          ? event.result
                          : JSON.stringify(event.result ?? {});
                      conversation.push({
                        role: "tool",
                        tool_call_id: event.id,
                        content: resultText,
                      } as any);
                    }
                    const marker = `\n\n🛠️ ${event.name} ${event.status}${
                      event.result && event.status === "completed"
                        ? ` — ${JSON.stringify(event.result).slice(0, 200)}`
                        : event.status === "failed"
                          ? ` — failed`
                          : ""
                    }`;
                    assistantMsg.text += marker;
                    assistantMsg.updatedAt = new Date().toISOString();
                    publishAssistantMessage(assistantMsg);
                  }
                },
              });

              for await (const _loopEvent of loop) {
                // onEvent handles all publishing
              }

              // Fallback: if model leaked a file write as text (e.g. {"path":"."} or
              // <caide-write>/<dyad-write>), parse and execute it so the build
              // still succeeds even when structured tool_call was missed. This
              // makes tool calling work for every model, not just muse-spark.
              // Uses the dyad-compatible parser so <caide-write> tags are handled exactly like dyad x caide.
              try {
                const { getCaideWriteTags, stripCaideTags } = await import(
                  "./harness/utils/caideTagParser.ts"
                );
                const fallbackWrites: Array<{ path: string; content: string }> = [];
                const text = assistantMsg.text ?? "";
                // 1) XML tags: <caide-write path="src/App.tsx">content</caide-write> and <dyad-write>
                // Use inline regex to avoid async import in this context (already handled above via tagRe2)
                const tagReFallback = /<(?:caide|dyad)-write[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/(?:caide|dyad)-write>/gi;
                let tm: RegExpExecArray | null;
                while ((tm = tagReFallback.exec(text)) !== null) {
                  const p = (tm[1] ?? "").trim();
                  let c = tm[2] ?? "";
                  const lines = c.split("\n");
                  if (lines[0]?.trim().startsWith("```")) lines.shift();
                  if (lines[lines.length - 1]?.trim().startsWith("```")) lines.pop();
                  c = lines.join("\n").trim();
                  if (p && c && p !== "." && p !== "/" && p !== "") fallbackWrites.push({ path: p, content: c });
                }
                // 2) JSON-ish: {"path":"src/App.tsx","content":"..."} or {"path":".","content":...}
                // Only if no XML tags were found to avoid double-executing
                if (fallbackWrites.length === 0) {
                  const jsonRe = /\{\s*"path"\s*:\s*"([^"]+)"\s*(?:,\s*"content"\s*:\s*"([\s\S]*?)"\s*)?\}/g;
                  while ((m = jsonRe.exec(text)) !== null) {
                    const p = (m[1] ?? "").trim();
                    // content may be JSON-escaped; try to unescape
                    let c = m[2] ?? "";
                    try {
                      // If content was JSON-stringified, it may contain \n and \" escapes
                      c = JSON.parse(`"${c.replace(/"/g, '\\"')}"`);
                    } catch {
                      // leave as-is
                    }
                    if (p && p !== "." && p !== "/" && p !== "" && c) {
                      fallbackWrites.push({ path: p, content: c });
                    } else if (p && (p === "." || p === "/" || p === "")) {
                      // Invalid path leaked as {"path":"."} — infer a sensible default for RN
                      // Don't execute with "."; instead log and let the model retry.
                      // We still want to avoid showing the raw JSON to the user.
                    }
                  }
                }
                if (fallbackWrites.length > 0) {
                  // Execute each inferred write via the same write_file tool so
                  // path validation and directory creation are consistent.
                  const { writeFileTool } = await import("./harness/tools/coreTools.ts");
                  for (const w of fallbackWrites) {
                    try {
                      await writeFileTool.execute(
                        { path: w.path, content: w.content },
                        {
                          signal: new AbortController().signal,
                          appPath,
                          sessionId: thread.id,
                          toolId: `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        } as any,
                      );
                      assistantMsg.text += `\n\n✅ Applied ${w.path} via fallback parser`;
                      assistantMsg.updatedAt = new Date().toISOString();
                      publishAssistantMessage(assistantMsg);
                    } catch (e: any) {
                      assistantMsg.text += `\n\n⚠️ Fallback write failed for ${w.path}: ${e?.message ?? String(e)}`;
                      publishAssistantMessage(assistantMsg);
                    }
                  }
                  // Strip the leaked tag/JSON from displayed text to avoid duplication + {"path":"."}
                  assistantMsg.text = assistantMsg.text
                    .replace(/<(?:caide|dyad)-write[^>]*>[\s\S]*?<\/(?:caide|dyad)-write>/gi, "")
                    .replace(/\{\s*"path"\s*:\s*"[^"]*"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                  publishAssistantMessage(assistantMsg);
                } else if (/\{\s*"path"\s*:\s*"\.?"\s*(?:,\s*"content")?/.test(text)) {
                  // Leaked JSON with invalid path like {"path":"."} or {"path":""} — strip it so user doesn't see it
                  assistantMsg.text = assistantMsg.text
                    .replace(/\{\s*"path"\s*:\s*"\.?"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
                    .replace(/\{\s*"path"\s*:\s*"[^"]*"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                  publishAssistantMessage(assistantMsg);
                }
              } catch (e) {
                console.warn("[harnessCompat] fallback parser error", e);
              }

              // Final dedupe: collapse duplicated sentences that slipped through
              // (e.g. "Building Molek...Building Molek..." or "Perfect...Perfect..." seen in flawless-koala)
              try {
                let deduped = assistantMsg.text;
                // If the same 40+ char block appears twice back-to-back, collapse to one
                deduped = deduped.replace(/(.{40,}?)\1/g, "$1");
                // Handle case where duplication has no separator: "life.Building" -> "life. Building"
                // Already covered by above, but also handle with period
                if (deduped !== assistantMsg.text) {
                  assistantMsg.text = deduped.trim();
                  assistantMsg.updatedAt = new Date().toISOString();
                  publishAssistantMessage(assistantMsg);
                }
              } catch {}

              assistantMsg.streaming = false;
              turn.status = "completed";
              thread.latestTurn = {
                turnId,
                state: "completed",
                requestedAt: now,
                startedAt: now,
                completedAt: new Date().toISOString(),
                assistantMessageId: assistantMsgId,
              };
              globalSnapshotSequence += 1;
              savePersistedState();

              publishDomainEvent({
                sequence: globalSnapshotSequence,
                aggregateKind: "thread",
                aggregateId: command.threadId,
                type: "thread.message-sent",
                payload: messageSentPayload(command.threadId, assistantMsg),
                createdAt: new Date().toISOString(),
              });
              publishDomainEvent({
                sequence: globalSnapshotSequence,
                aggregateKind: "thread",
                aggregateId: command.threadId,
                type: "thread.turn-diff-completed",
                payload: {
                  threadId: command.threadId,
                  turnId,
                  checkpointTurnCount: 1,
                  checkpointRef: turnId,
                  status: "ready",
                  files: [],
                  assistantMessageId: null,
                  completedAt: new Date().toISOString(),
                },
                createdAt: new Date().toISOString(),
              });
            } catch (err: any) {
              console.error("[harnessCompat] LLM turn error", err);
              assistantMsg.streaming = false;
              if (!assistantMsg.text) {
                assistantMsg.text = `Error: ${err?.message || "Failed to generate response."}`;
              }
              turn.status = "failed";
              thread.latestTurn = {
                turnId,
                state: "error",
                requestedAt: now,
                startedAt: now,
                completedAt: new Date().toISOString(),
                assistantMessageId: assistantMsgId,
              };
              globalSnapshotSequence += 1;
              savePersistedState();

              publishDomainEvent({
                sequence: globalSnapshotSequence,
                aggregateKind: "thread",
                aggregateId: command.threadId,
                type: "thread.message-sent",
                payload: messageSentPayload(command.threadId, assistantMsg),
                createdAt: new Date().toISOString(),
              });
              publishDomainEvent({
                sequence: globalSnapshotSequence,
                aggregateKind: "thread",
                aggregateId: command.threadId,
                type: "thread.turn-diff-completed",
                payload: {
                  threadId: command.threadId,
                  turnId,
                  checkpointTurnCount: 1,
                  checkpointRef: turnId,
                  status: "ready",
                  files: [],
                  assistantMessageId: null,
                  completedAt: new Date().toISOString(),
                },
                createdAt: new Date().toISOString(),
              });
            }
          })();
        }
        return { sequence: globalSnapshotSequence } as any;
      }),
    getReadModel: () => Effect.sync(() => emptyReadModel()),
    repairState: () => Effect.sync(() => emptyReadModel()),
    readEvents: () => Stream.fromIterable(eventLog),
    readEventsThrough: (from: number, through: number) =>
      Stream.fromIterable(eventLog.filter((e) => e.sequence > from && e.sequence <= through)),
    readThreadEvents: (threadId: string) =>
      Stream.fromIterable(
        eventLog.filter((e) => e.aggregateKind === "thread" && e.aggregateId === threadId),
      ),
    readThreadEventsThrough: (threadId: string, from: number, through: number) =>
      Stream.fromIterable(
        eventLog.filter(
          (e) =>
            e.aggregateKind === "thread" &&
            e.aggregateId === threadId &&
            e.sequence > from &&
            e.sequence <= through,
        ),
      ),
    subscribeDomainEvents: Effect.succeed(Stream.fromPubSub(domainEventsPubSub)),
    streamDomainEvents: Stream.fromPubSub(domainEventsPubSub),
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
      Effect.succeed(
        (() => {
          const base = emptyProfileStats(input?.utcOffsetMinutes ?? 0);
          // Derive live counts from in-memory harness state so the dashboard
          // reflects actual usage even though the real DB projections are
          // bypassed by the in-memory OrchestrationEngineService shim.
          const totalThreads = inMemoryThreads.length;
          const totalPromptsSent = inMemoryThreads.reduce(
            (acc, t: any) => acc + (t.messages ?? []).filter((m: any) => m.role === "user").length,
            0,
          );
          const frameworkCounts = new Map<string, number>();
          for (const p of inMemoryProjects) {
            const fw = p.framework ?? "blank";
            frameworkCounts.set(fw, (frameworkCounts.get(fw) ?? 0) + 1);
          }
          const frameworks = Array.from(frameworkCounts.entries()).map(([framework, count]) => ({
            framework,
            count,
            percent: inMemoryProjects.length > 0 ? Math.round((count / inMemoryProjects.length) * 100) : 0,
          }));
          const mostUsedFramework =
            frameworks.length > 0
              ? frameworks.reduce((a, b) => (a.count >= b.count ? a : b)).framework
              : null;
          // Simple heatmap: one cell per day with promptsToday bucket
          const today = new Date().toISOString().slice(0, 10);
          const promptsToday = inMemoryThreads.reduce(
            (acc, t: any) =>
              acc +
              (t.messages ?? []).filter(
                (m: any) => m.role === "user" && (m.createdAt ?? "").slice(0, 10) === today,
              ).length,
            0,
          );
          return {
            ...base,
            activity: {
              ...base.activity,
              totalThreads,
              totalPromptsSent,
              promptsToday,
              heatmap:
                promptsToday > 0
                  ? [{ date: today, count: promptsToday, level: Math.min(4, promptsToday) } as any]
                  : [],
            },
            frameworks,
            mostUsedFramework,
            insights: {
              ...base.insights,
              totalSkillsUsed: inMemoryThreads.reduce(
                (acc, t: any) => acc + (t.messages ?? []).flatMap((m: any) => m.skills ?? []).length,
                0,
              ),
            },
          };
        })(),
      ),
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
          get: () => Effect.succeed(null),
          getActive: () => Effect.succeed(null),
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
        streamGoalDomainEvents: Stream.fromPubSub(goalEventsPubSub),
        streamSubagentEvents: Stream.fromPubSub(subagentEventsPubSub),
        subscribeGoalEvents: () => Stream.fromPubSub(goalEventsPubSub),
        subscribeSubagentEvents: () => Stream.fromPubSub(subagentEventsPubSub),
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
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
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
  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
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
    description:
      "Product archetypes, design system, component contracts, a11y, anti-slop, and motion direction",
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
      const fallback =
        DEFAULT_MODELS_BY_PROVIDER[provider] ?? DEFAULT_MODELS_BY_PROVIDER.opencodeZen;
      // For opencode providers, fetch BOTH Zen and Go and merge so the picker
      // shows all 60+ Zen + 30+ Go models (per https://opencode.ai/zen/v1/models and /go/v1/models tables).
      // This fixes "app isnt registering all the models" — previously Zen only saw Zen, Go only saw Go.
      if (provider === "opencodeZen" || provider === "opencodeGo") {
        return Effect.tryPromise({
          try: async () => {
            const [zenModels, goModels] = await Promise.all([
              getDynamicOpenCodeModels("https://opencode.ai/zen/v1/models", DEFAULT_MODELS_BY_PROVIDER.opencodeZen).catch(() => DEFAULT_MODELS_BY_PROVIDER.opencodeZen),
              getDynamicOpenCodeModels("https://opencode.ai/zen/go/v1/models", DEFAULT_MODELS_BY_PROVIDER.opencodeGo).catch(() => DEFAULT_MODELS_BY_PROVIDER.opencodeGo),
            ]);
            // Merge and dedupe by slug, preserving live descriptors
            const seen = new Set<string>();
            const merged: any[] = [];
            for (const m of [...zenModels, ...goModels]) {
              if (!seen.has(m.slug)) {
                seen.add(m.slug);
                merged.push(m);
              }
            }
            return merged;
          },
          catch: () => fallback,
        }).pipe(Effect.map((models) => ({ models, source: "live-opencode-unified", cached: true })));
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
