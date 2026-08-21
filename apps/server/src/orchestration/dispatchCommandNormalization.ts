import type { ClientOrchestrationCommand, OrchestrationCommand } from "@caide/contracts";
import { isWorkspaceRootWithin, workspaceRootsEqual } from "@caide/shared/threadWorkspace";
import type { FileSystem, Path } from "effect";
import { Effect, Schedule } from "effect";

import { createAttachmentId } from "../attachmentStore";

export interface DispatchCommandNormalizerResult<E> {
  readonly command: OrchestrationCommand;
  /**
   * Deferred workspace-root scaffolding decided during normalization but NOT yet executed.
   * Callers must run this only after the normalized command has been successfully accepted
   * by the orchestration decider (e.g. after `orchestrationEngine.dispatch` resolves), so a
   * rejected dispatch (for example a cross-kind workspace-root ownership conflict) never
   * mutates the filesystem.
   */
  readonly prepareWorkspaceRoot: Effect.Effect<void, E> | null;
}

export interface DispatchCommandNormalizerOptions<E> {
  readonly attachmentsDir: string;
  readonly chatWorkspaceRoot?: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly canonicalizeProjectWorkspaceRoot: (
    workspaceRoot: string,
    options?: { readonly createIfMissing?: boolean },
  ) => Effect.Effect<string, E>;
  readonly prepareChatWorkspaceRoot?: (workspaceRoot: string) => Effect.Effect<void, E>;
  readonly prepareCaideAppWorkspaceRoot?: (workspaceRoot: string) => Effect.Effect<void, E>;
}

// Deferred workspace-root scaffolding (mkdir of managed subdirectories like Inbox/Outbox/
// work/outputs) can transiently fail on a flaky filesystem even though the underlying
// operation is safe to retry (it's idempotent recursive directory creation). Since this runs
// AFTER the orchestration decider has already accepted the dispatch (see wsRpc), a single
// transient failure here would otherwise permanently strand the project row without its
// managed subdirectories — per-thread CHAT workspace roots have no other re-run site. Retry a bounded number of times with a short
// backoff before letting the failure surface to the caller.
const WORKSPACE_ROOT_PREPARE_RETRY_SCHEDULE = Schedule.exponential("100 millis").pipe(
  Schedule.take(2),
);

export function makeDispatchCommandNormalizer<E>(options: DispatchCommandNormalizerOptions<E>) {
  // Scaffolds a managed chat container's workspace-root subdirectories. Per-thread project
  // workspace roots always live strictly WITHIN chatWorkspaceRoot (see
  // buildChatWorkspaceFolderPath in chatFirstSend.ts); the shared chatWorkspaceRoot itself is
  // never used directly as a project's root, so exact equality must be excluded to avoid ever
  // scaffolding "work"/"outputs" straight into the shared parent directory.
  const maybePrepareChatWorkspaceRoot = (
    command: Extract<
      ClientOrchestrationCommand,
      { type: "project.create" | "project.meta.update" }
    >,
    workspaceRoot: string,
  ): Effect.Effect<void, E> => {
    if (
      command.kind !== "chat" ||
      command.createWorkspaceRootIfMissing !== true ||
      !options.chatWorkspaceRoot ||
      !options.prepareChatWorkspaceRoot
    ) {
      return Effect.void;
    }
    const configured = options.chatWorkspaceRoot;
    const isWithin = isWorkspaceRootWithin(workspaceRoot, configured);
    const isEqual = workspaceRootsEqual(workspaceRoot, configured);
    if (!(isWithin && !isEqual)) {
      return Effect.void;
    }
    return options
      .prepareChatWorkspaceRoot(workspaceRoot)
      .pipe(Effect.retry(WORKSPACE_ROOT_PREPARE_RETRY_SCHEDULE));
  };

  const maybePrepareCaideAppWorkspaceRoot = (
    command: Extract<
      ClientOrchestrationCommand,
      { type: "project.create" | "project.meta.update" }
    >,
    workspaceRoot: string,
  ) => {
    if (command.kind !== "project" || command.createWorkspaceRootIfMissing !== true) {
      return Effect.void;
    }
    const prepare = options.prepareCaideAppWorkspaceRoot;
    if (!prepare) return Effect.void;
    // Only scaffold when the root is under the configured caide-apps base or looks like one
    const isCaidePattern =
      workspaceRoot.includes("/caide-apps/") || workspaceRoot.includes("/dyad-apps/");
    if (!isCaidePattern) {
      // Also check against configured base via lexical containment (best-effort)
      // Fall through to prepare — the scaffold helper itself re-checks containment
      // and will no-op if not actually a caide app, so we can just call it.
    }
    return prepare(workspaceRoot).pipe(Effect.retry(WORKSPACE_ROOT_PREPARE_RETRY_SCHEDULE));
  };

  // Combines the scaffolding decisions into a single deferred effect. The decision logic is
  // evaluated eagerly here (it's pure and side-effect-free), but the resulting `prepare`
  // effect is only *constructed*, never run, until the caller explicitly executes it.
  const deferredPrepareWorkspaceRoot = (
    command: Extract<
      ClientOrchestrationCommand,
      { type: "project.create" | "project.meta.update" }
    >,
    workspaceRoot: string,
  ): Effect.Effect<void, E> =>
    Effect.all(
      [
        maybePrepareChatWorkspaceRoot(command, workspaceRoot),
        maybePrepareCaideAppWorkspaceRoot(command, workspaceRoot),
      ],
      { discard: true },
    );

  return Effect.fnUntraced(function* (input: { readonly command: ClientOrchestrationCommand }) {
    if (input.command.type === "project.create") {
      // Known trade-off: canonicalization may create the (empty) root directory before the
      // decider validates ownership — realpath-based canonicalization needs the directory to
      // exist, and comparing lexical paths instead would mis-handle symlinked roots. A rejected
      // command can therefore leave an empty directory behind, but never scaffolding: the
      // subdirectory prepare is deferred until the dispatch is accepted (see wsRpc).
      const workspaceRoot = yield* options.canonicalizeProjectWorkspaceRoot(
        input.command.workspaceRoot,
        {
          createIfMissing: input.command.createWorkspaceRootIfMissing === true,
        },
      );
      const command = {
        ...input.command,
        workspaceRoot,
        createWorkspaceRootIfMissing: input.command.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
      return {
        command,
        prepareWorkspaceRoot: deferredPrepareWorkspaceRoot(input.command, workspaceRoot),
      };
    }

    if (input.command.type === "project.meta.update" && input.command.workspaceRoot !== undefined) {
      const workspaceRoot = yield* options.canonicalizeProjectWorkspaceRoot(
        input.command.workspaceRoot,
        {
          createIfMissing: input.command.createWorkspaceRootIfMissing === true,
        },
      );
      const command = {
        ...input.command,
        workspaceRoot,
        createWorkspaceRootIfMissing: input.command.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
      return {
        command,
        prepareWorkspaceRoot: deferredPrepareWorkspaceRoot(input.command, workspaceRoot),
      };
    }

    if (input.command.type !== "thread.turn.start") {
      return {
        command: input.command as OrchestrationCommand,
        prepareWorkspaceRoot: null,
      };
    }
    const turnStartCommand = input.command;

    const normalizedAttachments = yield* Effect.forEach(
      turnStartCommand.message.attachments,
      (attachment) =>
        Effect.gen(function* () {
          if (attachment.type === "assistant-selection") {
            const attachmentId = createAttachmentId(turnStartCommand.threadId);
            if (!attachmentId) {
              return yield* Effect.fail(new Error("Failed to create a safe attachment id."));
            }

            return {
              type: "assistant-selection" as const,
              id: attachmentId,
              assistantMessageId: attachment.assistantMessageId,
              text: attachment.text,
            };
          }

          // Binary attachment metadata is resolved from the durable managed
          // attachment ledger by OrchestrationEngine immediately before its
          // atomic event/receipt claim. Client metadata is never authoritative.
          return attachment;
        }),
      { concurrency: 1 },
    );

    return {
      command: {
        ...turnStartCommand,
        message: {
          ...turnStartCommand.message,
          attachments: normalizedAttachments,
        },
      } satisfies OrchestrationCommand,
      prepareWorkspaceRoot: null,
    };
  });
}
