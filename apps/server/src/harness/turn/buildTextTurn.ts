// FILE: buildTextTurn.ts
// Purpose: Build-mode text turn (008-m9b). V1's build path streams model
// text with ZERO native tools, repairs it (dry-run search-replace loop +
// unclosed-write continuation), then applies the file tags directly when the
// turn opted into auto-approve. Donor: chat_stream_handlers.ts build branch.
// The proposal-card path (autoApproveChanges off) stays on the native tool
// loop until the 017 surface lands — this module only runs when the turn
// explicitly opts in, so default behavior is unchanged.

import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessEvent } from "@caide/contracts";
import type { ChatMessage } from "../session/buildChain.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import {
  getCaideDeleteTags,
  getCaideRenameTags,
  getCaideWriteTags,
  hasUnclosedCaideWriteTag,
} from "../utils/caideTagParser.ts";
import {
  applyBuildResponseTags,
  dryRunSearchReplaceTags,
  type BuildTagIssue,
} from "../../dyad/editing/buildPipeline.ts";
import {
  advanceChain,
  buildPassPrompt,
  createChain,
  isBackendCodePath,
  isOnboardingScreenPath,
} from "../../dyad/prompts/checkpointChain.ts";
import type { CaideFramework } from "../../dyad/prompts/index.ts";

export interface BuildTextTurnInput {
  sessionId: string;
  turnId: string;
  appPath: string;
  framework?: CaideFramework;
  signal?: AbortSignal;
  llm: LLMAdapter;
  /** History builder shared with the native loop (system + history + prompt). */
  buildMessages: (extra: ChatMessage[]) => Promise<ChatMessage[]>;
  onEvent: (event: HarnessEvent) => void;
  /**
   * Donor autoApproveChanges: true applies file tags directly; false parks
   * a proposal card and applies only on approval (V1 default).
   */
  autoApprove: boolean;
  /** Brand-new scaffold (blueprint marker present): enables product-flow pass. */
  isNewApp: boolean;
}

export interface BuildTextTurnResult {
  /** Full accumulated model text (repairs + continuations included). */
  fullText: string;
  /** Pipeline outcome when tags were applied. */
  applied: Awaited<ReturnType<typeof applyBuildResponseTags>> | null;
}

/** Donor substantive-build gate: chain passes run after real file edits. */
const CHAIN_EDITS_BEFORE_PASS = 2;
/** Donor stepCountIs(20): every LLM stream in the turn counts. */
const MAX_BUILD_STREAMS = 20;

/** Write + rename + delete tag count (donor chainEditsNow, verbatim scope). */
function countChainEdits(text: string): number {
  return (
    getCaideWriteTags(text).length +
    getCaideRenameTags(text).length +
    getCaideDeleteTags(text).length
  );
}

function touchedPaths(text: string): string[] {
  return [
    ...getCaideWriteTags(text).map((tag) => tag.path),
    ...getCaideRenameTags(text).flatMap((tag) => [tag.from, tag.to]),
    ...getCaideDeleteTags(text),
  ];
}

/** Donor repair prompts (chat_stream_handlers.ts, verbatim). */
const FIX_READ_PROMPT =
  "There was an issue with the following `dyad-search-replace` tags. Make sure you use `dyad-read` to read the latest version of the file and then trying to do search & replace again.";
const FIX_WRITE_PROMPT =
  "There was an issue with the following `dyad-search-replace` tags. Please fix the errors by generating the code changes using `dyad-write` tags instead.";
const CONTINUE_PROMPT =
  "Your previous response did not finish completely. Continue exactly where you left off without any preamble.";
const MAX_REPAIR_ATTEMPTS = 2;
const MAX_CONTINUATION_ATTEMPTS = 2;

function formatIssues(issues: BuildTagIssue[]): string {
  return issues
    .map(({ filePath, error }) => `File path: ${filePath}\nError: ${error}`)
    .join("\n\n");
}

/** Adapted removeNonEssentialTags: strip thinking + problem-report blocks from repair history. */
function stripRepairHistoryNits(text: string): string {
  return text
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/<dyad-problem-report[\s\S]*?<\/dyad-problem-report>/gi, "")
    .trim();
}

/**
 * Stream one text pass with no tools (donor simpleStreamText without a tool
 * set). Tokens fan out live; the incremental text is returned for repair
 * checks. Tool-call chunks are ignored: the build contract is XML text, and
 * no registry is offered, so there is nothing to execute them against.
 */
async function streamTextPass(input: {
  sessionId: string;
  llm: LLMAdapter;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onEvent: (event: HarnessEvent) => void;
  emitTokens: (text: string) => void;
}): Promise<string> {
  let incremental = "";
  const stream = input.llm.stream(input.messages, {
    tools: [],
    ...(input.signal ? { signal: input.signal } : {}),
  });
  for await (const chunk of stream) {
    if (input.signal?.aborted) break;
    if (chunk.type === "token" && chunk.content) {
      incremental += chunk.content;
      input.emitTokens(chunk.content);
    }
  }
  return incremental;
}

export async function runBuildTextTurn(input: BuildTextTurnInput): Promise<BuildTextTurnResult> {
  const { sessionId, signal, llm, appPath } = input;
  let fullText = "";
  // Donor stepCountIs(20): the main stream, repairs, continuations, and
  // chain passes all draw from one budget.
  let streamsUsed = 0;
  const emitTokens = (text: string): void => {
    fullText += text;
    input.onEvent({ type: "token", sessionId, content: text });
  };

  // Main pass: history + turn prompt, no tools.
  streamsUsed++;
  await streamTextPass({
    sessionId,
    llm,
    messages: await input.buildMessages([]),
    ...(signal ? { signal } : {}),
    onEvent: input.onEvent,
    emitTokens,
  });

  // Dry-run repair loop (donor Turbo path, max 2 attempts): re-check the
  // latest incremental text; attempt 0 asks for re-read + search-replace,
  // attempt 1 asks for write tags instead.
  const preRepairText = fullText;
  let incremental = fullText;
  let issues = await dryRunSearchReplaceTags(fullText, appPath);
  let repairAttempts = 0;
  const previousAttempts: ChatMessage[] = [];
  while (issues.length > 0 && repairAttempts < MAX_REPAIR_ATTEMPTS && !signal?.aborted) {
    const warningXml =
      `<dyad-output type="warning" message="Could not apply Turbo Edits properly for some of the files; re-generating code...">` +
      `${formatIssues(issues)}</dyad-output>`;
    emitTokens(`\n\n${warningXml}`);
    const userPrompt: ChatMessage = {
      role: "user",
      content: `${repairAttempts === 0 ? FIX_READ_PROMPT : FIX_WRITE_PROMPT}\n\n${formatIssues(issues)}`,
    };
    repairAttempts++;
    streamsUsed++;
    incremental = await streamTextPass({
      sessionId,
      llm,
      messages: await input.buildMessages([
        { role: "assistant", content: stripRepairHistoryNits(preRepairText) },
        ...previousAttempts,
        userPrompt,
      ]),
      ...(signal ? { signal } : {}),
      onEvent: input.onEvent,
      emitTokens,
    });
    previousAttempts.push(userPrompt, {
      role: "assistant",
      content: stripRepairHistoryNits(incremental),
    });
    issues = await dryRunSearchReplaceTags(incremental, appPath);
  }

  // Unclosed-write continuation (donor, max 2 attempts).
  let continuationAttempts = 0;
  while (
    hasUnclosedCaideWriteTag(fullText) &&
    continuationAttempts < MAX_CONTINUATION_ATTEMPTS &&
    !signal?.aborted
  ) {
    continuationAttempts++;
    streamsUsed++;
    await streamTextPass({
      sessionId,
      llm,
      messages: await input.buildMessages([
        { role: "assistant", content: fullText },
        { role: "user", content: CONTINUE_PROMPT },
      ]),
      ...(signal ? { signal } : {}),
      onEvent: input.onEvent,
      emitTokens,
    });
  }

  // Checkpoint chain (donor, substantive builds only): deterministic
  // design-audit passes stream into the same response; a zero-change pass
  // retries exactly once, then the chain moves on. Mirrors the local-agent
  // chain. Deferred to later work: auto-fix problems (needs the 016
  // typecheck worker) and the MCP-agent detour (needs 013 + 018).
  let chainEditsNow = countChainEdits(fullText);
  if (chainEditsNow >= CHAIN_EDITS_BEFORE_PASS && !signal?.aborted) {
    const touched = touchedPaths(fullText);
    const chain = createChain({
      isNewApp: input.isNewApp,
      hasOnboardingScreens: touched.some(isOnboardingScreenPath),
      hasBackendCode: touched.some(isBackendCodePath),
      // De-Pro: no quota tiers exist, so every turn runs the full chain.
      freeModelMode: false,
      isWebApp: input.framework === "website",
    });
    let chainEditsAtPassStart = chainEditsNow;
    for (;;) {
      if (signal?.aborted || streamsUsed >= MAX_BUILD_STREAMS) break;
      const madeEdits = chainEditsNow > chainEditsAtPassStart;
      const { step, pass } = advanceChain(chain, madeEdits);
      if (!pass) break;
      chainEditsAtPassStart = chainEditsNow;
      streamsUsed++;
      await streamTextPass({
        sessionId,
        llm,
        messages: await input.buildMessages([
          { role: "assistant", content: fullText },
          { role: "user", content: buildPassPrompt(pass, { retry: step === "retry" }) },
        ]),
        ...(signal ? { signal } : {}),
        onEvent: input.onEvent,
        emitTokens,
      });
      // Re-count edits across the whole response (including tags the pass
      // emitted) to seed the next advance.
      chainEditsNow = countChainEdits(fullText);
    }
  }

  if (signal?.aborted) return { fullText, applied: null };
  if (fullText.trim().length === 0) {
    input.onEvent({
      type: "error",
      sessionId,
      code: "BUILD_EMPTY_RESPONSE",
      message: "The model returned no text for this build turn. Send a follow-up to retry.",
      recoverable: true,
    });
    return { fullText, applied: null };
  }

  // Proposal gate (donor shouldAutoApply): without auto-approve the turn
  // parks on an approve/reject card and applies only on approval. Dismissed,
  // timed-out, and tag-free responses apply nothing (V1 parity) with a short
  // transcript note so the turn never ends mysteriously empty-handed.
  if (!input.autoApprove) {
    const { requestBuildProposalApproval } = await import("../../dyad/editing/proposal.ts");
    const { decision } = await requestBuildProposalApproval({
      sessionId,
      fullText,
      ...(signal ? { signal } : {}),
    });
    if (decision !== "approved") {
      const note =
        decision === "rejected"
          ? "Proposal rejected — no files were changed."
          : decision === "timed-out"
            ? "Proposal expired unanswered — no files were changed."
            : decision === "empty"
              ? null
              : "Proposal dismissed — no files were changed.";
      if (note !== null) {
        fullText += `\n\n${note}`;
        input.onEvent({ type: "token", sessionId, content: `\n\n${note}` });
      }
      return { fullText, applied: null };
    }
  }

  // Direct apply (autoApproveChanges gate was checked by the caller).
  const applied = await applyBuildResponseTags(fullText, appPath);
  const appliedPaths = [...applied.writtenFiles, ...applied.renamedFiles];
  for (const relPath of appliedPaths) {
    if (signal?.aborted) break;
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(path.join(appPath, relPath)).size;
    } catch {
      // Renamed-away or deleted-after-write: report zero, keep the path.
    }
    input.onEvent({
      type: "artifact_updated",
      sessionId,
      path: relPath,
      framework: input.framework ?? "blank",
      sizeBytes,
    });
  }
  if (applied.errors.length > 0) {
    input.onEvent({
      type: "error",
      sessionId,
      code: "BUILD_APPLY_ERRORS",
      message: `Applied with ${applied.errors.length} file error(s): ${applied.errors
        .map((e) => e.message)
        .join("; ")
        .slice(0, 500)}`,
      recoverable: true,
    });
  }
  return { fullText, applied };
}
