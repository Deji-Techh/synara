import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessEvent, ProjectFramework } from "@caide/contracts";
import type { SliceDefinition } from "../slice/index.ts";
import type { SpecDoc } from "../planner/specValidator.ts";
import { assemblePrompt } from "../prompts/assembler.ts";
import { runLoop, type LLMAdapter, type ToolDefinition } from "../loop/loop.ts";
import { createDefaultRegistry } from "../tools/registry.ts";
import { Session } from "../session/index.ts";
import { safeEmitLive } from "../loop/events.ts";

export interface BuildSliceOptions {
  sessionId: string;
  slice: SliceDefinition;
  spec: SpecDoc;
  appPath: string;
  framework: ProjectFramework;
  llm: LLMAdapter;
  signal?: AbortSignal;
  onEvent?: (event: HarnessEvent) => void;
  maxSelfPatchAttempts?: number;
}

export interface BuildSliceResult {
  sliceId: string;
  success: boolean;
  artifactsCreated: string[];
  selfPatchAttempts: number;
  error?: string;
}

export class Builder {
  /**
   * Builds an isolated slice with fresh context and strict token compliance.
   */
  static async buildSlice(options: BuildSliceOptions): Promise<BuildSliceResult> {
    const {
      sessionId,
      slice,
      spec,
      appPath,
      framework,
      llm,
      signal,
      onEvent,
      maxSelfPatchAttempts = 2,
    } = options;

    const artifactsCreated: string[] = [];
    const toolRegistry = createDefaultRegistry();

    // Custom write tool interceptor to track created artifacts
    const customTools = new Map<string, ToolDefinition>();
    for (const [name, def] of toolRegistry.getMap().entries()) {
      if (name === "write_file") {
        customTools.set(name, {
          name: def.name,
          description: def.description,
          readOnly: false,
          execute: async (args: any, ctx) => {
            const res = (await def.execute(args, {
              ...ctx,
              appPath,
              sessionId,
              toolId: ctx.toolId,
            })) as { path: string; bytesWritten: number };

            artifactsCreated.push(res.path);

            safeEmitLive(onEvent, {
              type: "artifact_updated",
              sessionId,
              path: res.path,
              framework,
              sizeBytes: res.bytesWritten,
            });

            return res;
          },
        });
      } else {
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
    }

    // Assemble fresh slice context prompt
    const systemPrompt = assemblePrompt({
      role: "builder",
      stage: {
        stageName: `building_${slice.id}`,
        framework,
        availableArtifacts: slice.files,
        exitGate: `Files [${slice.files.join(", ")}] implemented with empty/loading/error states and design token compliance.`,
      },
      framework,
    });

    const initialUserPrompt = [
      `Implement Slice '${slice.name}' for app '${spec.appName}'.`,
      `Description: ${slice.description}`,
      `Target Files: ${slice.files.join(", ")}`,
      `Acceptance Criteria:\n${slice.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`,
      `\nRequirement Reminders:`,
      `1. Use exact design tokens from .caide/design-spec.json (background #0D0D0D, accent #E8493C, etc.).`,
      `2. Use motion tokens from .caide/motion-spec.json.`,
      `3. Include explicit empty state, loading state, and error state in every screen.`,
      `4. Ensure all interactive tap targets are at least 44px min.`,
      `5. Write complete production code using the write_file tool.`,
    ].join("\n");

    let patchAttempt = 0;
    let buildSucceeded = false;
    let lastError = "";

    while (patchAttempt <= maxSelfPatchAttempts && !buildSucceeded) {
      if (signal?.aborted) break;

      const session = new Session(`${sessionId}-${slice.id}-attempt-${patchAttempt}`);
      await session.append("system/prompt", systemPrompt);
      await session.append("user/message", patchAttempt === 0 ? initialUserPrompt : `Self-Patch Attempt ${patchAttempt}: Please resolve the following build/type issue:\n${lastError}`);

      const loop = runLoop({
        sessionId,
        signal,
        llm,
        tools: customTools,
        role: "builder",
        onEvent,
        buildMessages: async () => {
          return session.deriveMessages({ role: "builder" });
        },
      });

      for await (const _ of loop) {
        // stream events
      }

      if (signal?.aborted) break;

      // Self-check: verify written files exist on disk
      const allFilesExist = slice.files.every((file) => fs.existsSync(path.join(appPath, file)));
      if (allFilesExist || artifactsCreated.length > 0) {
        buildSucceeded = true;
      } else {
        patchAttempt += 1;
        lastError = `Target files [${slice.files.join(", ")}] were not created on disk.`;
      }
    }

    return {
      sliceId: slice.id,
      success: buildSucceeded,
      artifactsCreated: Array.from(new Set(artifactsCreated)),
      selfPatchAttempts: patchAttempt,
      error: buildSucceeded ? undefined : lastError || "Failed to build slice.",
    };
  }
}
