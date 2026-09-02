import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessEvent, ProjectFramework } from "@caide/contracts";
import { Verifier, type VerifyResult, type TokenViolation } from "../verifier/index.ts";
import { assemblePrompt } from "../prompts/assembler.ts";
import { runLoop, type LLMAdapter, type ToolDefinition } from "../loop/loop.ts";
import { createDefaultRegistry } from "../tools/registry.ts";
import { Session } from "../session/index.ts";
import { safeEmitLive } from "../loop/events.ts";

export interface FixIssuesOptions {
  sessionId: string;
  appPath: string;
  framework: ProjectFramework;
  verifyResult: VerifyResult;
  targetFiles: string[];
  llm: LLMAdapter;
  signal?: AbortSignal;
  onEvent?: (event: HarnessEvent) => void;
  maxAttempts?: number;
}

export interface FixIssuesResult {
  fixed: boolean;
  attemptsUsed: number;
  finalVerifyResult: VerifyResult;
  escalatedToHuman: boolean;
  checkpointEvent?: HarnessEvent;
}

export class Fixer {
  private static fixHistory = new Map<string, number>();

  /**
   * Applies targeted patches for issues found by the Verifier.
   * Loops up to maxAttempts (default 3), re-verifying after each pass.
   * If failing after max attempts, emits human checkpoint gate.
   */
  static async fixIssues(options: FixIssuesOptions): Promise<FixIssuesResult> {
    const {
      sessionId,
      appPath,
      framework,
      targetFiles,
      llm,
      signal,
      onEvent,
      maxAttempts = 3,
    } = options;

    let currentVerify = options.verifyResult;
    let attempt = 0;

    const toolRegistry = createDefaultRegistry();
    const customTools = new Map<string, ToolDefinition>();
    for (const [name, def] of toolRegistry.getMap().entries()) {
      customTools.set(name, {
        name: def.name,
        description: def.description,
        readOnly: def.readOnly,
        execute: async (args: any, ctx) => {
          return await def.execute(args, {
            ...ctx,
            appPath,
            sessionId,
            toolId: ctx.toolId,
          });
        },
      });
    }

    while (attempt < maxAttempts && !currentVerify.passed) {
      if (signal?.aborted) break;

      attempt += 1;

      safeEmitLive(onEvent, {
        type: "stage",
        sessionId,
        from: attempt === 1 ? "verifying" : "fixing",
        to: "fixing",
        meta: { attempt, remainingIssues: currentVerify.issues.length },
      });

      // Track recurring issues
      for (const issue of currentVerify.issues) {
        const count = (Fixer.fixHistory.get(issue) ?? 0) + 1;
        Fixer.fixHistory.set(issue, count);
      }

      // Assemble targeted fixer prompt
      const systemPrompt = assemblePrompt({
        role: "fixer",
        stage: {
          stageName: `fixing_attempt_${attempt}`,
          framework,
          availableArtifacts: targetFiles,
          exitGate:
            "All Verifier token/state/accessibility issues resolved with minimal surgical diff.",
        },
        framework,
      });

      const issueDetails = currentVerify.issues.map((iss, i) => `${i + 1}. ${iss}`).join("\n");
      const userPrompt = [
        `Please make targeted, surgical fixes to resolve the following Verifier issues:`,
        issueDetails,
        `\nTarget Files: ${targetFiles.join(", ")}`,
        `Directives:`,
        `1. Make minimal edits that resolve the exact issues. Do not restructure working code.`,
        `2. Ensure all colors use 'colorTokens.*' from design tokens.`,
        `3. Ensure touch targets have minHeight: 44.`,
        `4. Ensure screens have explicit Empty, Loading, and Error states.`,
      ].join("\n");

      const session = new Session(`${sessionId}-fix-attempt-${attempt}`);
      await session.append("system/prompt", systemPrompt);
      await session.append("user/message", userPrompt);

      const loop = runLoop({
        sessionId,
        signal,
        llm,
        tools: customTools,
        role: "fixer",
        onEvent,
        buildMessages: async () => session.deriveMessages({ role: "fixer" }),
      });

      for await (const _ of loop) {
        // stream
      }

      if (signal?.aborted) break;

      // Re-verify immediately after fix
      safeEmitLive(onEvent, {
        type: "stage",
        sessionId,
        from: "fixing",
        to: "verifying",
        meta: { afterFixAttempt: attempt },
      });

      currentVerify = await Verifier.verifyWorkspaceFiles(appPath, targetFiles);
      if (currentVerify.passed) {
        return {
          fixed: true,
          attemptsUsed: attempt,
          finalVerifyResult: currentVerify,
          escalatedToHuman: false,
        };
      }
    }

    // If still failing after maxAttempts, escalate to human checkpoint
    const checkpointEvent: HarnessEvent = {
      type: "checkpoint",
      sessionId,
      id: `checkpoint-fix-escalation-${Date.now()}`,
      reason: `Automated repair failed after ${maxAttempts} attempts for: ${targetFiles.join(", ")}`,
      requiresResponse: true,
      diff: [
        `⚠️ **Human Assistance Required (Fix Escalation)**`,
        `Automated Fixer could not resolve the following ${currentVerify.issues.length} issues:`,
        ...currentVerify.issues.map((i) => `  - ${i}`),
      ].join("\n"),
    };

    safeEmitLive(onEvent, checkpointEvent);

    return {
      fixed: currentVerify.passed,
      attemptsUsed: attempt,
      finalVerifyResult: currentVerify,
      escalatedToHuman: true,
      checkpointEvent,
    };
  }

  /**
   * Applies a surgical single-line or block replacement directly to a file.
   */
  static async applyTargetedPatch(
    filePath: string,
    targetSnippet: string,
    replacementSnippet: string,
  ): Promise<boolean> {
    if (!fs.existsSync(filePath)) return false;
    const content = await fs.promises.readFile(filePath, "utf-8");
    if (!content.includes(targetSnippet)) return false;

    const patched = content.replace(targetSnippet, replacementSnippet);
    await fs.promises.writeFile(filePath, patched, "utf-8");
    return true;
  }
}
