// FILE: miscTools.ts
// Purpose: Small read-side/verification tools: chat summary, context
// compression, reference import, guide reader.
// Donor: dyad x caide tools/{set_chat_summary,context_pruning,
// copy_reference,read_guide}.ts — schemas/descriptions/consent levels kept;
// Electron/DB/AI-SDK replaced:
// - chat title → session-scoped store (M4 persists to SQLite).
// - summarize_context → injected cheap-model summarizer; deterministic
//   extractive fallback when unwired (never fake LLM output).
// - read_guide → fs-loaded dyad/guides + framework filter (fixed import).
// capture_evidence is NOT here: exactly one def lives in dyad/goals
// (goal-gated, V1 parity). The session JSONL below is an internal helper
// for screenshotTool, never a tool.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { listUiSkillDocIds, readGuide, readUiSkillDoc } from "../prompts/skillLoader.ts";
import { appendMemoryNote } from "../memory/memory.ts";
import { filterGuideByFramework } from "../guides/filter_guide_by_framework.ts";
import type { CaideFramework } from "../prompts/framework.ts";

export class MiscValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiscValidationError";
  }
}

// --- session titles (set_chat_summary store; M4 persists) ---

const sessionTitles = new Map<string, string>();
export function getSessionTitle(sessionId: string): string | undefined {
  return sessionTitles.get(sessionId);
}
export function clearSessionTitle(sessionId: string): void {
  sessionTitles.delete(sessionId);
}

const setChatSummarySchema = z.object({
  summary: z.string().describe("A short summary/title for the chat"),
});

export const setChatSummaryTool = defineTool({
  name: "set_chat_summary",
  description:
    "Set the title/summary for this chat. Call this tool exactly once early in the turn, as soon as you understand the user's request well enough to write a short title. Do not wait until the end of the turn.",
  schema: setChatSummarySchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = setChatSummarySchema.parse(args);
    if (parsed.summary) sessionTitles.set(ctx.sessionId, parsed.summary);
    return `Chat summary set to: ${parsed.summary}`;
  },
  presentCall: (args: any) => args.summary,
});

// --- summarize_context (donor schema + description verbatim) ---

const summarizeContextSchema = z.object({
  current_goal: z.string().describe("A brief description of the current overarching goal."),
  active_files: z.array(z.string()).describe("The list of files currently relevant to the goal."),
  context_to_compress: z
    .string()
    .describe(
      "The raw text of recent reasoning, findings, or completed steps that you want to compress.",
    ),
});

export type ContextSummarizer = (input: { system: string; prompt: string }) => Promise<string>;

let summarizer: ContextSummarizer | null = null;
/** M3 wires the cheap-model provider summarizer here. */
export function setContextSummarizer(fn: ContextSummarizer | null): void {
  summarizer = fn;
}

/** Read the wired summarizer (null when no turn context set one). */
export function getContextSummarizer(): ContextSummarizer | null {
  return summarizer;
}

const COMPRESSION_SYSTEM = `You are a Context Compression Agent.
Your job is to take the verbose reasoning, findings, and completed steps of a senior developer and compress them into a dense, token-efficient summary.
Keep ALL technical facts, variable names, architecture decisions, and open bugs.
Discard filler words, polite conversation, and step-by-step logs of things that are already successfully completed.`;

function extractiveSummary(goal: string, files: string[], context: string): string {
  const head = context.slice(0, 1500);
  const tail = context.length > 3000 ? context.slice(-1500) : "";
  return [
    `[COMPRESSED CONTEXT — extractive fallback, no summarizer wired]`,
    `Goal: ${goal}`,
    `Active files: ${files.join(", ") || "(none)"}`,
    ``,
    head,
    tail ? `\n…\n${tail}` : "",
    ``,
    `(You may now rely on this summary and stop referencing the older verbose history.)`,
  ].join("\n");
}

export const summarizeContextTool = defineTool({
  name: "summarize_context",
  description: `Use this tool when your context window is getting too large or filled with completed/irrelevant tasks.
It invokes a fast, inexpensive model to compress your provided context into a dense, token-efficient summary.
You can then rely on this summary and safely 'forget' the verbose history, preventing context overflow.`,
  schema: summarizeContextSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => executeSummarizeContext(summarizeContextSchema.parse(args)),
  presentCall: () => "Compressing chat context...",
});

export async function executeSummarizeContext(
  input: z.infer<typeof summarizeContextSchema>,
): Promise<string> {
  const parsed = summarizeContextSchema.parse(input);
  const system = `${COMPRESSION_SYSTEM}\n\nCurrent Goal: ${parsed.current_goal}\nActive Files: ${parsed.active_files.join(", ")}\n`;
  if (!summarizer) {
    return extractiveSummary(parsed.current_goal, parsed.active_files, parsed.context_to_compress);
  }
  try {
    const text = await summarizer({
      system,
      prompt: `Compress the following context into a dense summary:\n\n${parsed.context_to_compress}`,
    });
    return `[COMPRESSED CONTEXT]\n${text}\n\n(You may now rely on this summary and stop referencing the older verbose history.)`;
  } catch (err) {
    return `Failed to compress context: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// --- copy_reference (donor sensitive-patterns + size cap verbatim) ---

const SENSITIVE_PATTERNS: RegExp[] = [
  /^\/etc\//,
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/boot\//,
  /^\/var\/log\//,
  new RegExp(`^${os.homedir()}/.ssh`),
  new RegExp(`^${os.homedir()}/.aws`),
  new RegExp(`^${os.homedir()}/.config/gcloud`),
  new RegExp(`^${os.homedir()}/.kube`),
];

const MAX_COPY_SIZE = 50 * 1024 * 1024;

function isPathBlocked(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(resolved)) return true;
  }
  return false;
}

function getFileSizeRecursive(fsPath: string): number {
  const stat = fs.statSync(fsPath);
  if (stat.isFile()) return stat.size;
  if (stat.isDirectory()) {
    let total = 0;
    for (const entry of fs.readdirSync(fsPath)) {
      total += getFileSizeRecursive(path.join(fsPath, entry));
    }
    return total;
  }
  return 0;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const copyReferenceSchema = z.object({
  path: z.string().describe("Absolute path to the file or folder to copy into the project"),
  destination: z
    .string()
    .optional()
    .describe(
      "Relative path within the project for the copy destination (defaults to the file/folder name in the project root)",
    ),
  description: z
    .string()
    .optional()
    .describe("Brief description of what this file contains and why it's needed"),
});

export const copyReferenceTool = defineTool({
  name: "copy_reference",
  description: `Copy a file or folder from outside the project into the current project. Use this when the user provides a reference file path and wants it included in their project. Sensitive system paths (/etc/, ~/.ssh/, etc.) are blocked. Shows a consent prompt with file size and details before copying.`,
  schema: copyReferenceSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeCopyReference(copyReferenceSchema.parse(args), ctx.appPath),
  presentCall: (args: any) => {
    try {
      const absPath = path.resolve(args.path);
      if (!fs.existsSync(absPath)) return `File not found: ${args.path}`;
      const size = formatSize(getFileSizeRecursive(absPath));
      const type = fs.statSync(absPath).isDirectory() ? "folder" : "file";
      return `Copy ${type} "${path.basename(absPath)}" (${size}) from ${absPath} into the project${args.destination ? ` to ${args.destination}` : ""}`;
    } catch {
      return `Copy ${args.path} into the project`;
    }
  },
});

export async function executeCopyReference(
  input: z.infer<typeof copyReferenceSchema>,
  appPath: string,
): Promise<string> {
  const parsed = copyReferenceSchema.parse(input);
  const absPath = path.resolve(parsed.path);
  if (!fs.existsSync(absPath)) {
    throw new MiscValidationError(`File or folder not found: ${absPath}`);
  }
  if (isPathBlocked(absPath)) {
    throw new MiscValidationError(`Cannot copy from a restricted system path: ${absPath}`);
  }
  const size = getFileSizeRecursive(absPath);
  if (size > MAX_COPY_SIZE) {
    throw new MiscValidationError(
      `File/folder too large to copy (${formatSize(size)} exceeds ${formatSize(MAX_COPY_SIZE)} limit)`,
    );
  }
  const stat = fs.statSync(absPath);
  const destName = parsed.destination ?? path.basename(absPath);
  const destPath = path.resolve(appPath, destName);
  if (!destPath.startsWith(path.resolve(appPath))) {
    throw new MiscValidationError(`Destination escapes the project: ${parsed.destination}`);
  }
  if (fs.existsSync(destPath)) {
    return `Destination already exists: ${destPath}. Choose a different destination path or remove the existing file first.`;
  }
  if (stat.isDirectory()) {
    fs.cpSync(absPath, destPath, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(absPath, destPath);
  }
  return `Successfully copied ${stat.isDirectory() ? "folder" : "file"} from ${absPath} to ${destPath}`;
}

// --- session evidence (goal-decoupled .caide/evidence JSONL) ---
// NOTE: there is exactly ONE `capture_evidence` tool and it lives in
// dyad/goals/goalTools.ts (goal-gated, V1 parity). This helper is the
// internal session log used by screenshotTool — it is NOT a tool def and
// must never be registered under the capture_evidence name (dispatch is
// first-match, so a second def would shadow the goal-coupled tool and break
// goal verification).

const sessionEvidenceSchema = z.object({
  kind: z
    .string()
    .describe("Evidence kind: test | typecheck | lint | build | screenshot | preview"),
  label: z.string().describe("Short label for what was verified"),
  reference: z
    .string()
    .min(1)
    .describe(
      "The command run or artifact path, e.g. 'bun run test' or '.caide/evidence/shot.png'",
    ),
  passed: z.boolean().describe("Whether this evidence indicates the check passed"),
});

export interface SessionEvidenceEntry {
  id: string;
  kind: string;
  label: string;
  reference: string;
  passed: boolean;
  revision: string | null;
  createdAt: number;
}

let evidenceCounter = 0;

export async function appendSessionEvidence(
  input: z.infer<typeof sessionEvidenceSchema>,
  sessionId: string,
  appPath: string,
): Promise<string> {
  const parsed = sessionEvidenceSchema.parse(input);
  let revision: string | null = null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd: appPath });
    revision = stdout.trim() || null;
  } catch {
    // best-effort
  }
  const entry: SessionEvidenceEntry = {
    id: `ev-${Date.now()}-${++evidenceCounter}`,
    kind: parsed.kind,
    label: parsed.label,
    reference: parsed.reference,
    passed: parsed.passed,
    revision,
    createdAt: Date.now(),
  };
  const dir = path.join(appPath, ".caide", "evidence");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.appendFile(path.join(dir, `${sessionId}.jsonl`), `${JSON.stringify(entry)}\n`);
  return `Evidence recorded (${parsed.passed ? "PASSED" : "FAILED"}): ${parsed.label}`;
}

// --- read_guide (donor registry pattern, fs-loaded guides) ---

const GUIDE_NAMES = [
  "add-authentication",
  "add-email-verification",
  "add-password-reset",
  "add-social-auth",
  "add-native-capability",
  "add-communications",
  "add-observability",
  "add-payments",
  "add-realtime-jobs",
  "add-storage-media",
  "build-secure-backend",
  "production-quality",
  "production-auth-authorization",
  "production-platform",
  "provision-backend",
].sort();

export function listGuideNames(): string[] {
  return [...GUIDE_NAMES];
}


const readGuideSchema = z.object({
  guide: z.string().describe(
    `Guide name. Implementation guides: ${GUIDE_NAMES.join(", ")}. UI-skill docs (references/templates/companions, fetched on demand instead of living in every prompt): see tool description for full list.`,
  ),
  framework: z
    .enum(["blank", "react-native", "flutter", "website"])
    .optional()
    .describe("Caide framework for framework-gated guide sections (defaults to unfiltered)"),
});

/**
 * Build the readGuideTool lazily so that listUiSkillDocIds() — which
 * references skillLoader.ts's UI_SKILL_DOCS const — is never called at
 * module-parse time. The bundler can order chunks such that this module
 * evaluates before UI_SKILL_DOCS is initialized (TDZ crash).
 */
let _readGuideTool: ToolDef<z.infer<typeof readGuideSchema>> | null = null;
function getReadGuideTool(): ToolDef<z.infer<typeof readGuideSchema>> {
  if (!_readGuideTool) {
    const skillList = listUiSkillDocIds()
      .map((id) => `skill:${id}`)
      .join(", ");
    _readGuideTool = defineTool({
      name: "read_guide",
      description: `Read a detailed implementation guide before building a matching feature. Implementation guides: ${GUIDE_NAMES.join(", ")}. UI-skill docs (design references, spec templates, companion skills — fetch the one you need instead of guessing): ${skillList}.`,
      schema: readGuideSchema,
      readOnly: true,
      modifiesState: false,
      execute: async (args) => executeReadGuide(readGuideSchema.parse(args)),
      presentCall: (args: any) => `Read guide: ${args.guide}`,
    });
  }
  return _readGuideTool;
}

/** @deprecated Use getReadGuideTool() for tool registration. */
export const readGuideTool: ToolDef<z.infer<typeof readGuideSchema>> = new Proxy(
  {} as ToolDef<z.infer<typeof readGuideSchema>>,
  {
    get(_target, prop) {
      return getReadGuideTool()[prop as keyof ToolDef];
    },
    set(_target, prop, value) {
      (getReadGuideTool() as any)[prop] = value;
      return true;
    },
  },
);


export function executeReadGuide(input: z.infer<typeof readGuideSchema>): string {
  const parsed = readGuideSchema.parse(input);
  if (parsed.guide.startsWith("skill:")) {
    const id = parsed.guide.slice("skill:".length);
    const content = readUiSkillDoc(id);
    if (!content) {
      throw new MiscValidationError(
        `UI-skill doc "${parsed.guide}" not found. Available: ${listUiSkillDocIds()
          .map((d) => `skill:${d}`)
          .join(", ")}`,
      );
    }
    return content;
  }
  if (!GUIDE_NAMES.includes(parsed.guide)) {
    throw new MiscValidationError(
      `Guide "${parsed.guide}" not found. Available guides: ${GUIDE_NAMES.join(", ")}`,
    );
  }
  const content = readGuide(parsed.guide);
  if (!content) {
    throw new MiscValidationError(`Guide "${parsed.guide}" failed to load from disk`);
  }
  const frameworkType = guideFrameworkType(parsed.framework);
  const hasSections = content.includes("<nextjs-only>") || content.includes("<vite-nitro-only>");
  return hasSections ? filterGuideByFramework(content, frameworkType) : content;
}

function guideFrameworkType(
  framework: CaideFramework | undefined,
): "vite" | "nextjs" | "other" | null {
  // Website scaffolds are Vite; anything else keeps both guide sections.
  if (framework === "website") return "vite";
  if (framework === undefined) return null;
  return "other";
}

// --- remember (Caide compounding memory; no donor equivalent) ---

const rememberSchema = z.object({
  note: z
    .string()
    .min(1)
    .max(500)
    .describe("One lasting rule, decision, or gotcha worth remembering across turns"),
  section: z
    .enum(["Standing notes", "Gotchas"])
    .optional()
    .describe("Where to file it (default Standing notes; Gotchas for things that broke)"),
});

export const rememberTool = defineTool({
  name: "remember",
  description: `Save a lasting project rule, decision, or gotcha to APP_MEMORY.md so future turns (and chats) in this project remember it. Use proactively when the user states a durable preference ("always do X", "never use Y"), when you discover a non-obvious constraint, or when something breaks in a surprising way. Do NOT record turn-specific trivia, file contents, or anything already covered by the plan. Memory is project-scoped — it never leaves this project.`,
  schema: rememberSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = rememberSchema.parse(args);
    await appendMemoryNote(ctx.appPath, parsed.section ?? "Standing notes", parsed.note);
    return `Remembered in this project's APP_MEMORY.md: ${parsed.note.slice(0, 200)}`;
  },
  presentCall: () => "Remember project note",
});

export const telemetryReviewTool = defineTool({
  name: "telemetry_review",
  description: [
    "Review this project's turn telemetry (.caide/telemetry/project-runs.jsonl): recurring failures with",
    "promotion proposals, best skill combinations, and per-skill usage. Use it when output quality slips,",
    "before tuning prompts, or when the user asks what keeps going wrong.",
  ].join(" "),
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const { ProjectLogStore, analyzeSkillUsage, formatTelemetryProposals } =
      await import("../../harness/selfImprove/projectLog.ts");
    const store = new ProjectLogStore(path.join(ctx.appPath, ".caide", "telemetry"));
    const logs = await store.readLogs().catch(() => []);
    if (logs.length === 0) {
      return "No telemetry logged yet for this project — run a few turns first (completed and failed turns append automatically).";
    }
    return formatTelemetryProposals(
      ProjectLogStore.analyzePatterns(logs),
      analyzeSkillUsage(logs),
      logs.length,
    );
  },
  presentCall: () => "Review project telemetry",
});

export const ALL_MISC_TOOLS: ToolDef[] = [
  setChatSummaryTool,
  summarizeContextTool,
  copyReferenceTool,
  readGuideTool,
  rememberTool,
  telemetryReviewTool,
];
