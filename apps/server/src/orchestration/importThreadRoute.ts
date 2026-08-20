// FILE: importThreadRoute.ts
// Purpose: Imports provider-native sessions and binds them to Caide thread projections.
// Layer: Orchestration command handler
// Exports: makeImportThreadHandler.

import {
  CommandId,
  type OrchestrationImportThreadInput,
  type ProviderKind,
  type ThreadHandoffImportedMessage,
  type ThreadId,
} from "@caide/contracts";
import {
  deriveAssociatedWorktreeMetadata,
  workspaceRootsEqual,
} from "@caide/shared/threadWorkspace";
import type { FileSystem, Path } from "effect";
import { Data, Effect, Option } from "effect";

import { resolveThreadWorkspaceCwd } from "../checkpointing/Utils";
import type { OrchestrationEngineShape } from "./Services/OrchestrationEngine";
import type { ProjectionSnapshotQueryShape } from "./Services/ProjectionSnapshotQuery";
import type { ProviderAdapterRegistryShape } from "../provider/Services/ProviderAdapterRegistry";
import type { ProviderServiceShape } from "../provider/Services/ProviderService";
import { parseManagedWorktreeWorkspaceRoot } from "../workspace/managedWorktree";
import {
  mapCodexSnapshotMessages,
  mapFactorySnapshotMessages,
  mapOpenCodeSnapshotMessages,
} from "./importedThreadMessages";

type ImportThreadRequest = OrchestrationImportThreadInput;

class ImportThreadError extends Data.TaggedError("ImportThreadError")<{
  readonly message: string;
}> {}

function importMessagesError(message: string): ImportThreadError {
  return new ImportThreadError({ message });
}

function providerResumeCursorForImport(provider: ProviderKind, externalId: string): unknown {
  switch (provider) {
    case "anthropic":
      return { resume: externalId };
    case "engine":
      return { schemaVersion: 1, sessionId: externalId };
    case "openai":
    case "google":
    case "openrouter":
    case "ollama":
    case "deepseek":
    case "groq":
    case "mistral":
    case "together":
    case "cohere":
    case "xai":
    case "fireworks":
    case "opencodeZen":
    case "opencodeGo":
      return { threadId: externalId };
    default:
      return { threadId: externalId };
  }
}

function mapProviderSessionStatusToOrchestrationStatus(
  status: "connecting" | "ready" | "running" | "error" | "closed",
): "starting" | "ready" | "running" | "error" | "stopped" {
  switch (status) {
    case "connecting":
      return "starting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "closed":
      return "stopped";
    case "ready":
    default:
      return "ready";
  }
}

export interface ImportThreadHandlerOptions {
  readonly fileSystem: FileSystem.FileSystem;
  readonly orchestrationEngine: OrchestrationEngineShape;
  readonly path: Path.Path;
  readonly platform: NodeJS.Platform;
  readonly projectionSnapshotQuery: ProjectionSnapshotQueryShape;
  readonly providerAdapterRegistry: ProviderAdapterRegistryShape;
  readonly providerService: ProviderServiceShape;
}

export function makeImportThreadHandler(options: ImportThreadHandlerOptions) {
  const dispatchImportedMessages = (input: {
    readonly createdAt: string;
    readonly messages: ReadonlyArray<ThreadHandoffImportedMessage>;
    readonly threadId: ThreadId;
  }) =>
    input.messages.length === 0
      ? Effect.void
      : options.orchestrationEngine.dispatch({
          type: "thread.messages.import",
          commandId: CommandId.makeUnsafe(crypto.randomUUID()),
          threadId: input.threadId,
          messages: input.messages,
          createdAt: input.createdAt,
        });

  const ensureAnthropicThreadImportable = Effect.fn(function* (_input: {
    readonly cwd: string | undefined;
    readonly externalId: string;
  }) {
    return;
  });

  const resolveImportedProviderThreadContext = Effect.fn(function* (input: {
    readonly provider: ProviderKind;
    readonly externalId: string;
    readonly projectWorkspaceRoot: string;
    readonly fallbackCwd?: string;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider(input.provider);
    if (!adapter.readExternalThread) return null;

    const snapshot = yield* adapter
      .readExternalThread({
        externalThreadId: input.externalId,
        ...(input.fallbackCwd ? { cwd: input.fallbackCwd } : {}),
      })
      .pipe(Effect.catch(() => Effect.succeed(null)));
    const externalCwd = snapshot?.cwd?.trim();
    if (!externalCwd) return null;

    if (
      workspaceRootsEqual(input.projectWorkspaceRoot, externalCwd, {
        platform: options.platform,
      })
    ) {
      return {
        runtimeCwd: externalCwd,
        patch: {
          envMode: "local" as const,
          worktreePath: null,
          associatedWorktreePath: null,
          associatedWorktreeBranch: null,
          associatedWorktreeRef: null,
        },
      };
    }

    const relativeToProjectRoot = options.path.relative(input.projectWorkspaceRoot, externalCwd);
    if (
      relativeToProjectRoot.length > 0 &&
      !relativeToProjectRoot.startsWith("..") &&
      !options.path.isAbsolute(relativeToProjectRoot)
    ) {
      return {
        runtimeCwd: externalCwd,
        patch: null,
      };
    }

    let currentPath = externalCwd;
    while (true) {
      const gitPointerFileContents = yield* options.fileSystem
        .readFileString(options.path.join(currentPath, ".git"))
        .pipe(Effect.catch(() => Effect.succeed(null)));

      if (gitPointerFileContents) {
        const workspaceRoot = parseManagedWorktreeWorkspaceRoot({
          gitPointerFileContents,
          path: options.path,
          worktreePath: currentPath,
        });
        if (
          workspaceRoot &&
          workspaceRootsEqual(input.projectWorkspaceRoot, workspaceRoot, {
            platform: options.platform,
          })
        ) {
          return {
            runtimeCwd: externalCwd,
            patch: {
              envMode: "worktree" as const,
              branch: null,
              worktreePath: currentPath,
              ...deriveAssociatedWorktreeMetadata({
                branch: null,
                worktreePath: currentPath,
              }),
            },
          };
        }
      }

      const parentPath = options.path.dirname(currentPath);
      if (parentPath === currentPath) return null;
      currentPath = parentPath;
    }
  });

  const importOpenAiThreadHistory = Effect.fn(function* (input: {
    readonly importedAt: string;
    readonly threadId: ThreadId;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider("openai");
    const snapshot = yield* adapter
      .readThread(input.threadId)
      .pipe(
        Effect.mapError((cause) =>
          importMessagesError(
            cause instanceof Error && cause.message.length > 0
              ? cause.message
              : "Failed to read OpenAI thread history.",
          ),
        ),
      );

    yield* dispatchImportedMessages({
      threadId: input.threadId,
      messages: mapCodexSnapshotMessages({
        threadId: input.threadId,
        turns: snapshot.turns,
        importedAt: input.importedAt,
      }),
      createdAt: input.importedAt,
    });
  });

  const importAnthropicThreadHistory = Effect.fn(function* (input: {
    readonly importedAt: string;
    readonly threadId: ThreadId;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider("anthropic");
    const snapshot = yield* adapter
      .readThread(input.threadId)
      .pipe(
        Effect.mapError((cause) =>
          importMessagesError(
            cause instanceof Error && cause.message.length > 0
              ? cause.message
              : "Failed to read Anthropic session history.",
          ),
        ),
      );

    yield* dispatchImportedMessages({
      threadId: input.threadId,
      messages: mapCodexSnapshotMessages({
        threadId: input.threadId,
        turns: snapshot.turns,
        importedAt: input.importedAt,
      }),
      createdAt: input.importedAt,
    });
  });

  const importEngineThreadHistory = Effect.fn(function* (input: {
    readonly importedAt: string;
    readonly threadId: ThreadId;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider("engine");
    const snapshot = yield* adapter
      .readThread(input.threadId)
      .pipe(
        Effect.mapError((cause) =>
          importMessagesError(
            cause instanceof Error && cause.message.length > 0
              ? cause.message
              : "Failed to read Engine session history.",
          ),
        ),
      );

    yield* dispatchImportedMessages({
      threadId: input.threadId,
      messages: mapCodexSnapshotMessages({
        threadId: input.threadId,
        turns: snapshot.turns,
        importedAt: input.importedAt,
      }),
      createdAt: input.importedAt,
    });
  });

  const importOpenCodeCompatibleThreadHistory = Effect.fn(function* (input: {
    readonly importedAt: string;
    readonly provider: ProviderKind;
    readonly threadId: ThreadId;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider(input.provider);
    const snapshot = yield* adapter
      .readThread(input.threadId)
      .pipe(
        Effect.mapError((cause) =>
          importMessagesError(
            cause instanceof Error && cause.message.length > 0
              ? cause.message
              : `Failed to read ${String(input.provider)} session history.`,
          ),
        ),
      );

    yield* dispatchImportedMessages({
      threadId: input.threadId,
      messages: mapOpenCodeSnapshotMessages({
        threadId: input.threadId,
        turns: snapshot.turns,
        importedAt: input.importedAt,
      }),
      createdAt: input.importedAt,
    });
  });

  const importGenericThreadHistory = Effect.fn(function* (input: {
    readonly externalId: string;
    readonly importedAt: string;
    readonly threadId: ThreadId;
    readonly provider: ProviderKind;
  }) {
    const adapter = yield* options.providerAdapterRegistry.getByProvider(input.provider);
    if (!adapter.readExternalThread) {
      return yield* Effect.fail(importMessagesError(`${String(input.provider)} session import is unavailable.`));
    }
    const snapshot = yield* adapter
      .readExternalThread({ externalThreadId: input.externalId })
      .pipe(
        Effect.mapError((cause) =>
          importMessagesError(
            cause instanceof Error && cause.message.length > 0
              ? cause.message
              : `Failed to read ${String(input.provider)} session history.`,
          ),
        ),
      );
    yield* dispatchImportedMessages({
      threadId: input.threadId,
      messages: mapFactorySnapshotMessages({
        threadId: input.threadId,
        turns: snapshot.turns,
        importedAt: input.importedAt,
      }),
      createdAt: input.importedAt,
    });
  });

  return Effect.fnUntraced(function* (body: ImportThreadRequest) {
    const threadOption = yield* options.projectionSnapshotQuery.getThreadDetailById(body.threadId);
    if (Option.isNone(threadOption)) {
      return yield* Effect.fail(importMessagesError(`Thread '${body.threadId}' was not found.`));
    }
    const thread = threadOption.value;

    if (thread.session && thread.session.status !== "stopped") {
      return yield* Effect.fail(
        importMessagesError(`Thread '${body.threadId}' already has an active provider session.`),
      );
    }

    const projectOption = yield* options.projectionSnapshotQuery.getProjectShellById(
      thread.projectId,
    );
    const project = Option.getOrNull(projectOption);
    const cwd = resolveThreadWorkspaceCwd({
      thread,
      projects: project
        ? [
            {
              id: project.id,
              kind: project.kind,
              workspaceRoot: project.workspaceRoot,
            },
          ]
        : [],
    });
    const externalId = body.externalId.trim();

    const importedProviderContext =
      (thread.modelSelection.provider === "openai" ||
        thread.modelSelection.provider === "anthropic" ||
        thread.modelSelection.provider === "engine" ||
        thread.modelSelection.provider === "google") &&
      project
        ? yield* resolveImportedProviderThreadContext({
            provider: thread.modelSelection.provider,
            externalId,
            projectWorkspaceRoot: project.workspaceRoot,
            ...(cwd ? { fallbackCwd: cwd } : {}),
          })
        : null;

    if (importedProviderContext?.patch) {
      yield* options.orchestrationEngine.dispatch({
        type: "thread.meta.update",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        threadId: thread.id,
        ...importedProviderContext.patch,
      });
    }

    if (thread.modelSelection.provider === "anthropic") {
      yield* ensureAnthropicThreadImportable({
        cwd,
        externalId,
      });
    }

    const importResumeCursor = providerResumeCursorForImport(
      thread.modelSelection.provider,
      externalId,
    );
    const session = yield* options.providerService.startSession(thread.id, {
      threadId: thread.id,
      provider: thread.modelSelection.provider,
      ...((importedProviderContext?.runtimeCwd ?? cwd)
        ? { cwd: importedProviderContext?.runtimeCwd ?? cwd }
        : {}),
      modelSelection: thread.modelSelection,
      ...(thread.modelSelection.provider === "openai"
        ? { forkSourceResumeCursor: importResumeCursor }
        : { resumeCursor: importResumeCursor }),
      runtimeMode: thread.runtimeMode,
    });

    yield* Effect.gen(function* () {
      if (thread.modelSelection.provider === "openai") {
        yield* importOpenAiThreadHistory({
          threadId: thread.id,
          importedAt: session.updatedAt,
        });
      } else if (thread.modelSelection.provider === "anthropic") {
        yield* importAnthropicThreadHistory({
          threadId: thread.id,
          importedAt: session.updatedAt,
        });
      } else if (thread.modelSelection.provider === "engine") {
        yield* importEngineThreadHistory({
          threadId: thread.id,
          importedAt: session.updatedAt,
        });
      } else if (
        thread.modelSelection.provider === "google" ||
        thread.modelSelection.provider === "openrouter" ||
        thread.modelSelection.provider === "opencodeZen" ||
        thread.modelSelection.provider === "opencodeGo"
      ) {
        yield* importOpenCodeCompatibleThreadHistory({
          provider: thread.modelSelection.provider,
          threadId: thread.id,
          importedAt: session.updatedAt,
        });
      } else {
        yield* importGenericThreadHistory({
          provider: thread.modelSelection.provider,
          threadId: thread.id,
          externalId,
          importedAt: session.updatedAt,
        });
      }
    }).pipe(
      Effect.onError(() =>
        options.providerService.stopSession({ threadId: thread.id }).pipe(Effect.ignore),
      ),
    );

    yield* options.orchestrationEngine.dispatch({
      type: "thread.session.set",
      commandId: CommandId.makeUnsafe(crypto.randomUUID()),
      threadId: thread.id,
      session: {
        threadId: thread.id,
        status: mapProviderSessionStatusToOrchestrationStatus(session.status),
        providerName: session.provider,
        runtimeMode: thread.runtimeMode,
        activeTurnId: null,
        lastError: session.lastError ?? null,
        updatedAt: session.updatedAt,
      },
      createdAt: session.updatedAt,
    });

    return { threadId: thread.id };
  });
}
