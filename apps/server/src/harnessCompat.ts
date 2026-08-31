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
          getActive: () => Effect.succeed([]),
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
