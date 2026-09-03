import {
  type ModelSelection,
  type OrchestrationShellSnapshot,
  type ProviderInteractionMode,
  type ProviderKind,
  type ProviderNativeCommandDescriptor,
  type ProviderModelOptions,
  type RuntimeMode,
  type ThreadId,
} from "@caide/contracts";
import { deriveAssociatedWorktreeMetadata } from "@caide/shared/threadWorkspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { newCommandId, newMessageId, newThreadId } from "../lib/utils";
import { ensureNativeApi, readNativeApi } from "../nativeApi";
import type { Project, Thread } from "../types";
import type { ComposerTrigger } from "../composer-logic";
import { extendReplacementRangeForTrailingSpace } from "../composerTriggerInsertion";
import {
  buildBtwPrompt,
  buildGoalCreateTitle,
  buildGrillMePrompt,
  buildInitPrompt,
  buildLearnPrompt,
  buildAskPrompt,
  buildVerifyPrompt,
  buildFixPrompt,
  buildMcpPrompt,
  buildReviewPrompt,
  buildSlashReviewComposerPrompt,
  buildSpawnPrompt,
  buildSubagentsPrompt,
  buildTeamworkPreviewPrompt,
  getAvailableComposerSlashCommands,
  hasProviderNativeSlashCommand,
  parseBuildSlashCommandArgs,
  parseComposerSlashInvocationForCommands,
  parseFastSlashCommandAction,
  parseForkSlashCommandArgs,
  parseGoalSlashArgs,
  type ForkSlashCommandTarget,
} from "../composerSlashCommands";
import { useGoalStore } from "../goalStore";
import { buildThreadHandoffImportedMessages } from "../lib/threadHandoff";
import { toastManager } from "../components/ui/toast";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import { buildNextProviderOptions } from "../providerModelOptions";
import { resolveForkThreadEnvironment } from "../lib/threadEnvironment";
import { type SplitViewId } from "../splitViewStore";
import { useRightDockStore } from "../rightDockStore";
import { usePreviewStageStore } from "../previewStageStore";
import { registerSidechatCreator } from "../lib/sidechatCreatorRegistry";
import { downloadUrlAsBlob } from "../lib/browserDownload";
import { resolveWsHttpUrl } from "../lib/wsHttpUrl";
import { useFeedbackDialogStore } from "../feedbackDialogStore";
import {
  createOrJoinSidechat,
  createSidechatThread,
  sendSidechatPrompt,
  type SidechatCreationFlight,
} from "../lib/sidechatCreation";

type ComposerSnapshot = {
  value: string;
  cursor: number;
  expandedCursor: number;
};

type SlashCommandItem = Extract<ComposerCommandItem, { type: "slash-command" }>;

function wasPromptReplacementApplied(result: number | false): boolean {
  return result !== false;
}

export function useComposerSlashCommands(input: {
  activeProject: Project | undefined;
  activeThread: Thread | undefined;
  activeRootBranch: string | null;
  isServerThread: boolean;
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferSideCommand: boolean;
  canOfferExportCommand: boolean;
  supportsTextNativeReviewCommand: boolean;
  fastModeEnabled: boolean;
  providerNativeCommands: readonly ProviderNativeCommandDescriptor[];
  providerCommandDiscoveryCwd: string | null;
  selectedProvider: ProviderKind;
  currentProviderModelOptions: ProviderModelOptions[ProviderKind] | undefined;
  selectedModelSelection: ModelSelection;
  environmentMode: string | null;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  threadId: ThreadId;
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
  navigateToThread: (threadId: ThreadId, options?: { splitViewId?: SplitViewId }) => Promise<void>;
  handleClearConversation: () => Promise<void> | void;
  handleInteractionModeChange: (mode: ProviderInteractionMode) => Promise<void> | void;
  openForkTargetPicker: () => void;
  openReviewTargetPicker: () => void;
  openModelPicker: () => void;
  setComposerDraftProviderModelOptions: (
    threadId: ThreadId,
    provider: ProviderKind,
    nextProviderOptions: ProviderModelOptions[ProviderKind],
    options?: { persistSticky?: boolean },
  ) => void;
  editorActions: {
    resolveActiveComposerTrigger: () => {
      snapshot: ComposerSnapshot;
      trigger: ComposerTrigger | null;
    };
    applyPromptReplacement: (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: { expectedText?: string; cursorOffset?: number },
    ) => number | false;
    clearComposerSlashDraft: () => void;
    setComposerPromptValue: (nextPrompt: string) => void;
    scheduleComposerFocus: () => void;
    setComposerHighlightedItemId: (id: string | null) => void;
  };
}) {
  const [isSlashStatusDialogOpen, setIsSlashStatusDialogOpen] = useState(false);
  const navigate = useNavigate();
  const openGlobalFeedbackDialog = useFeedbackDialogStore((state) => state.openDialog);
  const {
    activeProject,
    activeThread,
    activeRootBranch,
    isServerThread,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferSideCommand,
    canOfferExportCommand,
    supportsTextNativeReviewCommand,
    fastModeEnabled,
    providerNativeCommands,
    providerCommandDiscoveryCwd,
    selectedProvider,
    currentProviderModelOptions,
    selectedModelSelection,
    environmentMode,
    runtimeMode,
    interactionMode,
    threadId,
    syncServerShellSnapshot,
    navigateToThread,
    handleClearConversation,
    handleInteractionModeChange,
    openForkTargetPicker,
    openReviewTargetPicker,
    openModelPicker,
    setComposerDraftProviderModelOptions,
    editorActions,
  } = input;
  const providerNativeCommandNames = providerNativeCommands.map((command) => command.name);
  const availableBuiltInSlashCommands = getAvailableComposerSlashCommands({
    provider: selectedProvider,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferReviewCommand: true,
    canOfferForkCommand: true,
    canOfferSideCommand: true,
    canOfferExportCommand,
    providerNativeCommandNames,
  });

  const compactProviderThread = useCallback(async (): Promise<boolean> => {
    const api = readNativeApi();
    if (
      !api ||
      !canOfferCompactCommand ||
      !isServerThread ||
      !activeThread?.session ||
      activeThread.session.status === "closed"
    ) {
      toastManager.add({
        type: "warning",
        title: "Compact is unavailable",
        description: "Open an active supported server thread before compacting context.",
      });
      return false;
    }

    try {
      void api.provider
        .compactThread({
          threadId: activeThread.id,
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not compact thread",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while compacting context.",
          });
        });
      return true;
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not compact thread",
        description:
          error instanceof Error ? error.message : "An error occurred while compacting context.",
      });
      return false;
    }
  }, [activeThread, canOfferCompactCommand, isServerThread]);

  const setFastModeFromSlashCommand = useCallback(
    (enabled: boolean) => {
      setComposerDraftProviderModelOptions(
        threadId,
        selectedProvider,
        buildNextProviderOptions(selectedProvider, currentProviderModelOptions, {
          fastMode: enabled,
        }),
        {
          persistSticky: true,
        },
      );
    },
    [currentProviderModelOptions, selectedProvider, setComposerDraftProviderModelOptions, threadId],
  );

  const runFastSlashCommand = useCallback(
    (text: string) => {
      const action = parseFastSlashCommandAction(text);
      if (action === null) {
        return false;
      }
      if (!supportsFastSlashCommand) {
        toastManager.add({
          type: "warning",
          title: "Fast mode is unavailable",
          description: "The selected model does not support Fast mode.",
        });
        return true;
      }
      if (action === "invalid") {
        toastManager.add({
          type: "warning",
          title: "Invalid /fast command",
          description: "Use /fast, /fast on, /fast off, or /fast status.",
        });
        return true;
      }
      if (action === "status") {
        toastManager.add({
          type: "info",
          title: `Fast mode is ${fastModeEnabled ? "on" : "off"}`,
        });
        return true;
      }
      const nextEnabled = action === "on" ? true : action === "off" ? false : !fastModeEnabled;
      setFastModeFromSlashCommand(nextEnabled);
      toastManager.add({
        type: "success",
        title: `Fast mode ${nextEnabled ? "enabled" : "disabled"}`,
      });
      return true;
    },
    [fastModeEnabled, supportsFastSlashCommand, setFastModeFromSlashCommand],
  );

  const createForkThreadFromSlashCommand = useCallback(
    async (inputOptions?: { target?: ForkSlashCommandTarget }) => {
      const api = readNativeApi();
      if (!api || !activeProject || !activeThread || !isServerThread) {
        toastManager.add({
          type: "warning",
          title: "Fork is unavailable",
          description: "Only existing server-backed threads can be forked right now.",
        });
        return true;
      }

      const importedMessages = buildThreadHandoffImportedMessages(activeThread);

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      // Fork first, then let the normal first-send worktree bootstrap create the cwd if needed.
      const resolvedTarget = resolveForkThreadEnvironment({
        target: inputOptions?.target ?? "local",
        activeRootBranch,
        sourceThread: activeThread,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.fork.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        sourceThreadId: activeThread.id,
        projectId: activeProject.id,
        title: activeThread.title,
        modelSelection: selectedModelSelection,
        runtimeMode,
        interactionMode,
        envMode: resolvedTarget.envMode,
        branch: resolvedTarget.branch,
        worktreePath: resolvedTarget.worktreePath,
        workingDirectory: activeThread.workingDirectory ?? null,
        associatedWorktreePath: resolvedTarget.associatedWorktreePath,
        associatedWorktreeBranch: resolvedTarget.associatedWorktreeBranch,
        associatedWorktreeRef: resolvedTarget.associatedWorktreeRef,
        importedMessages: [...importedMessages],
        createdAt,
      });
      const snapshot = await api.orchestration.getShellSnapshot();
      syncServerShellSnapshot(snapshot);
      await navigateToThread(nextThreadId);
      return true;
    },
    [
      activeProject,
      activeRootBranch,
      activeThread,
      interactionMode,
      isServerThread,
      navigateToThread,
      runtimeMode,
      selectedModelSelection,
      syncServerShellSnapshot,
    ],
  );

  const sidechatCreationBySourceThreadIdRef = useRef(new Map<ThreadId, SidechatCreationFlight>());
  const createSidechatFromSlashCommand = useCallback(
    (inputOptions?: { initialPrompt?: string }): Promise<true> => {
      const api = readNativeApi();
      if (
        !api ||
        !activeProject ||
        !activeThread ||
        !isServerThread ||
        activeThread.sidechatSourceThreadId
      ) {
        toastManager.add({
          type: "warning",
          title: "Side is unavailable",
          description: "Open a server-backed main thread before starting Side.",
        });
        return Promise.resolve(true);
      }

      return createOrJoinSidechat({
        inFlightBySourceThreadId: sidechatCreationBySourceThreadIdRef.current,
        sourceThreadId: activeThread.id,
        initialPrompt: inputOptions?.initialPrompt,
        startCreation: (initialPrompt) =>
          createSidechatThread({
            api,
            project: activeProject,
            sourceThread: activeThread,
            selectedModelSelection,
            initialPrompt,
            openSidechat: (sidechatThreadId) => {
              useRightDockStore.getState().openPane(activeThread.id, {
                kind: "sidechat",
                threadId: sidechatThreadId,
              });
            },
            syncServerShellSnapshot,
          }),
        sendQueuedPrompt: (sidechatThreadId, prompt) =>
          sendSidechatPrompt({
            api,
            threadId: sidechatThreadId,
            selectedModelSelection,
            prompt,
          }),
        onCreationResult: (result) => {
          if (result.promptError) {
            toastManager.add({
              type: "warning",
              title: "Side chat started without the prompt",
              description: "The side chat is open. Send the prompt again when it finishes loading.",
            });
          } else if (result.snapshotError) {
            toastManager.add({
              type: "warning",
              title: "Side chat is still syncing",
              description:
                "The fork succeeded and will appear as soon as the thread list refreshes.",
            });
          }
        },
        onQueuedPromptError: () => {
          toastManager.add({
            type: "warning",
            title: "Side chat prompt was not sent",
            description: "The side chat is open. Send the prompt again when it finishes loading.",
          });
        },
      });
    },
    [activeProject, activeThread, isServerThread, selectedModelSelection, syncServerShellSnapshot],
  );

  // Publish a stable host capability. Composer drafts, attachments, and modes only
  // affect whether `/side` is offered; they must not make the dock action disappear.
  useEffect(() => {
    if (!activeProject || !activeThread || !isServerThread || activeThread.sidechatSourceThreadId) {
      return;
    }
    return registerSidechatCreator(threadId, createSidechatFromSlashCommand);
  }, [activeProject, activeThread, createSidechatFromSlashCommand, isServerThread, threadId]);

  const runCodexReviewStart = useCallback(
    async (target: "changes" | "base-branch") => {
      const api = readNativeApi();
      if (!api || !activeThread || !activeProject) {
        toastManager.add({
          type: "warning",
          title: "Review is unavailable",
          description: "Open a project thread before starting a native review.",
        });
        return false;
      }

      if (target === "base-branch" && !activeRootBranch) {
        toastManager.add({
          type: "warning",
          title: "Base branch unavailable",
          description: "Select or detect a base branch before starting this review.",
        });
        return false;
      }

      const messageText =
        target === "base-branch" && activeRootBranch
          ? `Review against base branch ${activeRootBranch}`
          : "Review current changes";

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const nextThreadTitle =
        target === "base-branch" ? `${activeThread.title} Review` : `${activeThread.title} Review`;
      const associatedWorktree = deriveAssociatedWorktreeMetadata({
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        associatedWorktreePath: activeThread.associatedWorktreePath ?? null,
        associatedWorktreeBranch: activeThread.associatedWorktreeBranch ?? null,
        associatedWorktreeRef: activeThread.associatedWorktreeRef ?? null,
      });

      // Hoisted out of the `try` below: React Compiler cannot lower `??`/`?:` inside a try block and
      // would skip this whole hook, so the composer would lose its memoization on every keystroke.
      const nextEnvMode =
        activeThread.envMode ?? (activeThread.worktreePath ? "worktree" : "local");
      const nextWorkingDirectory = activeThread.workingDirectory ?? null;
      const nextLastKnownPr = activeThread.lastKnownPr ?? null;
      const reviewTarget =
        target === "base-branch"
          ? ({ type: "baseBranch", branch: activeRootBranch! } as const)
          : ({ type: "uncommittedChanges" } as const);

      try {
        await api.orchestration.dispatchCommand({
          type: "thread.create",
          commandId: newCommandId(),
          threadId: nextThreadId,
          projectId: activeProject.id,
          title: nextThreadTitle,
          modelSelection: selectedModelSelection,
          runtimeMode,
          interactionMode: "default",
          envMode: nextEnvMode,
          branch: activeThread.branch,
          worktreePath: activeThread.worktreePath,
          workingDirectory: nextWorkingDirectory,
          lastKnownPr: nextLastKnownPr,
          ...associatedWorktree,
          createdAt,
        });
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: messageText,
            attachments: [],
          },
          modelSelection: selectedModelSelection,
          reviewTarget,
          dispatchMode: "queue",
          runtimeMode,
          interactionMode: "default",
          createdAt,
        });
        const snapshot = await api.orchestration.getShellSnapshot();
        syncServerShellSnapshot(snapshot);
        await navigateToThread(nextThreadId);
        return true;
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not start review",
          description:
            error instanceof Error ? error.message : "An error occurred while starting review.",
        });
        return false;
      }
    },
    [
      activeProject,
      activeRootBranch,
      activeThread,
      navigateToThread,
      runtimeMode,
      selectedModelSelection,
      syncServerShellSnapshot,
    ],
  );

  const handleReviewTargetSelection = useCallback(
    async (target: "changes" | "base-branch") => {
      if (selectedProvider === "openai") {
        await runCodexReviewStart(target);
      } else {
        const replacement = buildSlashReviewComposerPrompt(target === "base-branch" ? "base" : "");
        editorActions.setComposerPromptValue(replacement);
      }
      editorActions.scheduleComposerFocus();
    },
    [editorActions, selectedProvider, runCodexReviewStart],
  );

  const handleForkTargetSelection = useCallback(
    async (target: ForkSlashCommandTarget) => {
      try {
        await createForkThreadFromSlashCommand({ target });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not fork thread",
          description:
            error instanceof Error
              ? error.message
              : "An error occurred while creating the forked thread.",
        });
      }
    },
    [createForkThreadFromSlashCommand],
  );

  const checkClaudeFastSlashCommandAvailability = useCallback(async (): Promise<boolean> => {
    const api = readNativeApi();
    if (!api || !providerCommandDiscoveryCwd) {
      editorActions.clearComposerSlashDraft();
      toastManager.add({
        type: "warning",
        title: "Fast mode could not be checked",
        description: "Claude command discovery is unavailable right now.",
      });
      return false;
    }

    try {
      const result = await api.provider.listCommands({
        provider: "anthropic",
        cwd: providerCommandDiscoveryCwd,
        threadId,
        forceReload: true,
      });
      if (
        hasProviderNativeSlashCommand(
          "anthropic",
          result.commands.map((command) => command.name),
          "fast",
        )
      ) {
        return true;
      }
    } catch {
      editorActions.clearComposerSlashDraft();
      toastManager.add({
        type: "warning",
        title: "Fast mode could not be checked",
        description: "Claude command discovery failed. Please try again.",
      });
      return false;
    }

    editorActions.clearComposerSlashDraft();
    toastManager.add({
      type: "info",
      title: "Fast mode is unavailable",
      description: "Claude did not expose /fast for this account or environment.",
    });
    return false;
  }, [editorActions, providerCommandDiscoveryCwd, threadId]);

  const runExportSlashCommand = useCallback(() => {
    // Re-validate at call time (mirrors /compact): menu selections and stale
    // highlights can outlive the availability computed at render time.
    if (!canOfferExportCommand) {
      toastManager.add({
        type: "warning",
        title: "Export is unavailable",
        description:
          "Open a server-backed thread and wait for the current turn to finish before exporting.",
      });
      return;
    }
    const params = new URLSearchParams({ threadId: threadId });
    void downloadUrlAsBlob({
      url: resolveWsHttpUrl(`/api/thread-export?${params.toString()}`),
      filename: `caide-thread-${threadId}.zip`,
    }).catch((error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not export thread",
        description:
          error instanceof Error ? error.message : "An error occurred while exporting the thread.",
      });
    });
  }, [canOfferExportCommand, threadId]);

  const openFeedbackDialog = useCallback(() => {
    openGlobalFeedbackDialog({
      provider: selectedProvider,
      model: selectedModelSelection.model,
      projectKind: activeProject?.kind ?? null,
      environmentMode,
      runtimeMode,
      interactionMode,
      sessionStatus: activeThread?.session?.status ?? null,
      latestTurnState: activeThread?.latestTurn?.state ?? null,
      messageCount: activeThread?.messages.length ?? 0,
      activityCount: activeThread?.activities.length ?? 0,
      hasPendingApproval: activeThread?.hasPendingApprovals === true,
      hasPendingUserInput: activeThread?.hasPendingUserInput === true,
      hasThreadError: Boolean(activeThread?.error),
    });
  }, [
    activeProject?.kind,
    activeThread,
    environmentMode,
    interactionMode,
    openGlobalFeedbackDialog,
    runtimeMode,
    selectedModelSelection.model,
    selectedProvider,
  ]);

  const openGoalsPane = useCallback(() => {
    useRightDockStore.getState().openPane(threadId, { kind: "goals" });
  }, [threadId]);

  // Dyad `/goal` handling: `/goal` opens the goals pane (compose into the
  // goal flow), `/goal <objective>` creates + starts a durable engine goal via
  // `NativeApi.goals.createGoal`, and `/goal <subcommand>` drives the active
  // goal's controls (pause/resume/cancel/retry/verify/steer) or, for browse
  // subcommands (status/edit/tasks/logs/evidence/blockers/history), the Goals
  // pane where those surfaces live. `appId` is intentionally omitted so the
  // engine resolves the current app for this thread.
  const runGoalSlashCommand = useCallback(
    (args: string): void => {
      const store = useGoalStore.getState();
      const parsed = parseGoalSlashArgs(args);

      if (parsed.kind === "subcommand") {
        const { subcommand, argument } = parsed;
        const activeGoal = store.activeGoal;
        const controlActions = ["pause", "resume", "cancel", "retry", "verify", "steer"] as const;

        if ((controlActions as readonly string[]).includes(subcommand)) {
          if (!activeGoal) {
            toastManager.add({
              type: "info",
              title: "No active goal",
              description: "Create a goal first with /goal <objective>.",
            });
            openGoalsPane();
            return;
          }
          const pastTense: Record<string, string> = {
            pause: "paused",
            resume: "resumed",
            cancel: "cancelled",
            retry: "retried",
            verify: "verified",
            steer: "steered",
          };
          const run = (() => {
            switch (subcommand) {
              case "pause":
                return store.pauseGoal(activeGoal.id);
              case "resume":
                return store.resumeGoal(activeGoal.id);
              case "cancel":
                return store.cancelGoal(activeGoal.id);
              case "retry":
                return store.retryGoal(activeGoal.id);
              case "verify":
                return store.verifyGoal(activeGoal.id);
              case "steer":
                if (!argument) {
                  toastManager.add({
                    type: "warning",
                    title: "Missing steer instruction",
                    description: "Use /goal steer <instruction>.",
                  });
                  return Promise.resolve(null);
                }
                return store.steerGoal(activeGoal.id, argument);
              default:
                return Promise.resolve(null);
            }
          })();
          void run.then((goal) => {
            if (goal) {
              toastManager.add({
                type: "success",
                title: `Goal ${pastTense[subcommand] ?? "updated"}`,
                description: goal.title,
              });
            }
          });
          openGoalsPane();
          return;
        }

        if (subcommand === "status" && activeGoal) {
          toastManager.add({
            type: "info",
            title: activeGoal.title,
            description: `${activeGoal.status} — ${activeGoal.verifiedTaskCount}/${activeGoal.totalTaskCount} tasks verified`,
          });
        } else if (subcommand === "status") {
          toastManager.add({
            type: "info",
            title: "No active goal",
            description: "Create a goal first with /goal <objective>.",
          });
        }
        // status | edit | tasks | logs | evidence | blockers | history all
        // live in the Goals pane — open it so the user can act.
        openGoalsPane();
        return;
      }

      const objective = parsed.objective;
      if (!objective) {
        openGoalsPane();
        return;
      }
      const title = buildGoalCreateTitle(objective);
      void store.createGoal({ title, objective }).then((goal) => {
        if (goal) {
          toastManager.add({
            type: "success",
            title: "Goal created",
            description: `${goal.title} — running autonomously`,
          });
        } else {
          toastManager.add({
            type: "error",
            title: "Could not create goal",
            description:
              "An error occurred while creating the goal. See the Goals pane for details.",
          });
        }
        openGoalsPane();
      });
    },
    [openGoalsPane],
  );

  const handleStandaloneSlashCommand = useCallback(
    async (trimmed: string): Promise<boolean> => {
      const fastSlashAction = parseFastSlashCommandAction(trimmed);
      if (selectedProvider === "anthropic" && fastSlashAction !== null) {
        if (await checkClaudeFastSlashCommandAvailability()) {
          return false;
        }
        return true;
      }

      const slashInvocation = parseComposerSlashInvocationForCommands(
        trimmed,
        availableBuiltInSlashCommands,
      );
      if (!slashInvocation) {
        return false;
      }
      if (slashInvocation.command === "model") {
        editorActions.clearComposerSlashDraft();
        openModelPicker();
        return true;
      }
      if (slashInvocation.command === "clear") {
        editorActions.clearComposerSlashDraft();
        await handleClearConversation();
        return true;
      }
      if (slashInvocation.command === "compact") {
        editorActions.clearComposerSlashDraft();
        await compactProviderThread();
        return true;
      }
      if (
        slashInvocation.command === "plan" ||
        slashInvocation.command === "default" ||
        slashInvocation.command === "debug"
      ) {
        await handleInteractionModeChange(slashInvocation.command);
        editorActions.clearComposerSlashDraft();
        return true;
      }
      if (slashInvocation.command === "status") {
        editorActions.clearComposerSlashDraft();
        setIsSlashStatusDialogOpen(true);
        return true;
      }
      if (slashInvocation.command === "subagents") {
        editorActions.setComposerPromptValue(buildSubagentsPrompt(slashInvocation.args));
        return true;
      }
      if (slashInvocation.command === "export") {
        editorActions.clearComposerSlashDraft();
        runExportSlashCommand();
        return true;
      }
      if (slashInvocation.command === "feedback") {
        editorActions.clearComposerSlashDraft();
        openFeedbackDialog();
        return true;
      }
      if (slashInvocation.command === "review") {
        if (selectedProvider === "openai") {
          const normalizedArgs = slashInvocation.args.trim().toLowerCase();
          if (normalizedArgs.length === 0) {
            editorActions.clearComposerSlashDraft();
            openReviewTargetPicker();
            return true;
          }
          const target =
            normalizedArgs === "base" || normalizedArgs.startsWith("base ") ? "base-branch" : null;
          if (!target) {
            toastManager.add({
              type: "warning",
              title: "Invalid /review command",
              description: "Use /review and then choose a review target.",
            });
            return true;
          }
          editorActions.clearComposerSlashDraft();
          await runCodexReviewStart(target);
          return true;
        }
        if (supportsTextNativeReviewCommand && slashInvocation.args.length === 0) {
          return false;
        }
        if (slashInvocation.args.length === 0) {
          editorActions.clearComposerSlashDraft();
          openReviewTargetPicker();
          return true;
        }
        editorActions.setComposerPromptValue(buildSlashReviewComposerPrompt(slashInvocation.args));
        return true;
      }
      if (slashInvocation.command === "fast") {
        editorActions.clearComposerSlashDraft();
        runFastSlashCommand(trimmed);
        return true;
      }
      if (slashInvocation.command === "fork") {
        const { target, invalid } = parseForkSlashCommandArgs(slashInvocation.args);
        if (invalid) {
          toastManager.add({
            type: "warning",
            title: "Invalid /fork command",
            description: "Use /fork and then choose Local or New Worktree.",
          });
          return true;
        }
        try {
          if (!target) {
            editorActions.clearComposerSlashDraft();
            openForkTargetPicker();
            return true;
          }
          await createForkThreadFromSlashCommand({
            target,
          });
          editorActions.clearComposerSlashDraft();
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Could not fork thread",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while creating the forked thread.",
          });
        }
        return true;
      }
      if (slashInvocation.command === "side") {
        if (!canOfferSideCommand) {
          toastManager.add({
            type: "warning",
            title: "Side is unavailable",
            description: "Remove composer attachments or context before using /side.",
          });
          return true;
        }
        try {
          editorActions.clearComposerSlashDraft();
          await createSidechatFromSlashCommand({ initialPrompt: slashInvocation.args });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Could not start Side",
            description:
              error instanceof Error ? error.message : "An error occurred while creating Side.",
          });
        }
        return true;
      }

      if (
        slashInvocation.command === "btw" ||
        slashInvocation.command === "grill-me" ||
        slashInvocation.command === "teamwork-preview" ||
        slashInvocation.command === "learn"
      ) {
        const buildPrompt =
          slashInvocation.command === "btw"
            ? buildBtwPrompt
            : slashInvocation.command === "grill-me"
              ? buildGrillMePrompt
              : slashInvocation.command === "teamwork-preview"
                ? buildTeamworkPreviewPrompt
                : buildLearnPrompt;
        editorActions.setComposerPromptValue(buildPrompt(slashInvocation.args));
        return true;
      }

      if (
        slashInvocation.command === "goal" ||
        slashInvocation.command === "goals" ||
        slashInvocation.command === "commands" ||
        slashInvocation.command === "help"
      ) {
        editorActions.clearComposerSlashDraft();
        if (slashInvocation.command === "goal") {
          runGoalSlashCommand(slashInvocation.args);
        } else if (slashInvocation.command === "goals") {
          openGoalsPane();
        } else if (slashInvocation.command === "commands") {
          toastManager.add({
            type: "info",
            title: "Browse slash commands",
            description: "Type / in the composer to browse all built-in commands.",
          });
        } else {
          toastManager.add({
            type: "info",
            title: "Engine help",
            description:
              "The engine help bot isn't wired to the web yet — /goal, /goals and the Goals pane cover autonomous tasks.",
          });
        }
        return true;
      }

      if (slashInvocation.command === "schedule") {
        // The scheduling engine lives behind the automation flow (/automation).
        const nextPrompt = slashInvocation.args.trim();
        editorActions.setComposerPromptValue(
          nextPrompt.length > 0 ? `/automation ${nextPrompt}` : "/automation ",
        );
        return true;
      }

      if (slashInvocation.command === "preview") {
        editorActions.clearComposerSlashDraft();
        const stageStore = usePreviewStageStore.getState();
        const wasOpen = stageStore.stageStateByThreadId[threadId]?.open ?? false;
        stageStore.toggle(threadId);
        const isNowOpen = !wasOpen;
        if (isNowOpen) {
          const dockState = useRightDockStore.getState().dockStateByThreadId[threadId];
          if (dockState?.open) useRightDockStore.getState().setDockOpen(threadId, false);
        }
        return true;
      }

      if (slashInvocation.command === "browser") {
        editorActions.clearComposerSlashDraft();
        useRightDockStore.getState().openPane(threadId, { kind: "browser" });
        return true;
      }

      if (slashInvocation.command === "doctor" || slashInvocation.command === "theme") {
        editorActions.clearComposerSlashDraft();
        void navigate({ to: "/settings" });
        return true;
      }

      if (
        slashInvocation.command === "test" ||
        slashInvocation.command === "analyze" ||
        slashInvocation.command === "build"
      ) {
        editorActions.clearComposerSlashDraft();
        usePreviewStageStore.getState().open(threadId);
        {
          const dockState = useRightDockStore.getState().dockStateByThreadId[threadId];
          if (dockState?.open) useRightDockStore.getState().setDockOpen(threadId, false);
        }
        if (slashInvocation.command === "test") {
          void ensureNativeApi()
            .preview.test({ threadId })
            .then((result: any) => {
              const passed = result.passed ?? result.output?.includes("pass");
              toastManager.add({
                type: result.passed ? "success" : "warning",
                title: "Tests finished",
                description:
                  result.output?.slice(0, 200) ?? `${passed ? "Passed" : "Check output"}`,
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Test failed",
                description: error instanceof Error ? error.message : "Could not run tests.",
              });
            });
        } else if (slashInvocation.command === "analyze") {
          void ensureNativeApi()
            .preview.analyze({ threadId })
            .then((result: any) => {
              const clean = result.clean ?? result.passed ?? result.issues?.length === 0;
              toastManager.add({
                type: clean ? "success" : "warning",
                title: "Analyze finished",
                description: clean
                  ? "No issues found"
                  : `${result.issues?.length ?? "?"} issue(s) found`,
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Analyze failed",
                description: error instanceof Error ? error.message : "Could not run analyze.",
              });
            });
        } else {
          const buildArgs = parseBuildSlashCommandArgs(slashInvocation.args);
          if (
            !buildArgs ||
            buildArgs.invalid ||
            buildArgs.target === null ||
            buildArgs.channel === null
          ) {
            toastManager.add({
              type: "warning",
              title: "Invalid /build command",
              description: "Use /build, /build apk|appbundle|ipa, or /build <target> <channel>.",
            });
            return true;
          }
          const buildTarget = buildArgs.target;
          const buildChannel = buildArgs.channel;
          void ensureNativeApi()
            .preview.buildStart({ threadId, target: buildTarget, channel: buildChannel })
            .then(() => {
              toastManager.add({
                type: "success",
                title: `Build started (${buildTarget}/${buildChannel})`,
                description: "Track progress in the preview quality gate.",
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Build failed to start",
                description: error instanceof Error ? error.message : "Could not start build.",
              });
            });
        }
        return true;
      }

      return false;
    },
    [
      availableBuiltInSlashCommands,
      canOfferSideCommand,
      checkClaudeFastSlashCommandAvailability,
      compactProviderThread,
      createForkThreadFromSlashCommand,
      createSidechatFromSlashCommand,
      editorActions,
      handleClearConversation,
      handleInteractionModeChange,
      openForkTargetPicker,
      openFeedbackDialog,
      openModelPicker,
      openReviewTargetPicker,
      selectedProvider,
      supportsTextNativeReviewCommand,
      runCodexReviewStart,
      runExportSlashCommand,
      runFastSlashCommand,
      runGoalSlashCommand,
      openGoalsPane,
      navigate,
    ],
  );

  const handleSlashCommandSelection = useCallback(
    (item: SlashCommandItem) => {
      const { snapshot, trigger } = editorActions.resolveActiveComposerTrigger();
      if (!trigger) {
        return;
      }

      if (item.command === "automation") {
        const replacement = "/automation ";
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
          editorActions.scheduleComposerFocus();
        }
        return;
      }

      const clearSlashCommandFromComposer = () =>
        editorActions.applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });

      if (item.command === "model") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openModelPicker();
        return;
      }

      if (item.command === "clear") {
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        void handleClearConversation();
        return;
      }

      if (item.command === "compact") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void compactProviderThread();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "plan" || item.command === "default" || item.command === "debug") {
        void handleInteractionModeChange(item.command);
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (item.command === "init") {
        const replacement = buildInitPrompt("");
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          trigger.rangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (item.command === "spawn" || item.command === "subagents") {
        const replacement = buildSpawnPrompt("");
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          trigger.rangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (
        item.command === "ask" ||
        item.command === "verify" ||
        item.command === "fix" ||
        item.command === "mcp"
      ) {
        const builders = {
          ask: buildAskPrompt,
          verify: buildVerifyPrompt,
          fix: buildFixPrompt,
          mcp: buildMcpPrompt,
        } as const;
        const replacement = builders[item.command as keyof typeof builders]("");
        const applied = editorActions.applyPromptReplacement(
          trigger.rangeStart,
          trigger.rangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd) },
        );
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
        }
        return;
      }

      if (item.command === "status") {
        const applied = clearSlashCommandFromComposer();
        if (wasPromptReplacementApplied(applied)) {
          editorActions.setComposerHighlightedItemId(null);
          setIsSlashStatusDialogOpen(true);
          editorActions.scheduleComposerFocus();
        }
        return;
      }

      if (item.command === "fast") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void runFastSlashCommand("/fast");
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "export") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        runExportSlashCommand();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "feedback") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openFeedbackDialog();
        return;
      }

      if (item.command === "review") {
        if (selectedProvider === "openai") {
          const applied = clearSlashCommandFromComposer();
          if (!wasPromptReplacementApplied(applied)) {
            return;
          }
          editorActions.setComposerHighlightedItemId(null);
          openReviewTargetPicker();
          editorActions.scheduleComposerFocus();
          return;
        }
        if (supportsTextNativeReviewCommand) {
          const replacement = "/review";
          const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
            snapshot.value,
            trigger.rangeEnd,
            replacement,
          );
          const applied = editorActions.applyPromptReplacement(
            trigger.rangeStart,
            replacementRangeEnd,
            replacement,
            { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
          );
          if (wasPromptReplacementApplied(applied)) {
            editorActions.setComposerHighlightedItemId(null);
          }
          return;
        }
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openReviewTargetPicker();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "fork") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        openForkTargetPicker();
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "side") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void createSidechatFromSlashCommand().catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not start Side",
            description:
              error instanceof Error ? error.message : "An error occurred while creating Side.",
          });
        });
        return;
      }

      if (item.command === "goal") {
        // Menu insert composes the objective: typing the objective then
        // sending /goal <objective> creates a real engine goal.
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        editorActions.setComposerPromptValue("/goal ");
        editorActions.scheduleComposerFocus();
        return;
      }

      if (
        item.command === "btw" ||
        item.command === "grill-me" ||
        item.command === "teamwork-preview" ||
        item.command === "learn"
      ) {
        const buildPrompt =
          item.command === "btw"
            ? buildBtwPrompt
            : item.command === "grill-me"
              ? buildGrillMePrompt
              : item.command === "teamwork-preview"
                ? buildTeamworkPreviewPrompt
                : buildLearnPrompt;
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        editorActions.setComposerPromptValue(buildPrompt(""));
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "goals" || item.command === "commands" || item.command === "help") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        if (item.command === "goals") {
          openGoalsPane();
        } else if (item.command === "commands") {
          toastManager.add({
            type: "info",
            title: "Browse slash commands",
            description: "Type / in the composer to browse all built-in commands.",
          });
        } else {
          toastManager.add({
            type: "info",
            title: "Engine help",
            description:
              "The engine help bot isn't wired to the web yet — /goal, /goals and the Goals pane cover autonomous tasks.",
          });
        }
        return;
      }

      if (item.command === "schedule") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        editorActions.setComposerPromptValue("/automation ");
        editorActions.scheduleComposerFocus();
        return;
      }

      if (item.command === "preview") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        const stageStore = usePreviewStageStore.getState();
        const wasOpen = stageStore.stageStateByThreadId[threadId]?.open ?? false;
        stageStore.toggle(threadId);
        const isNowOpen = !wasOpen;
        if (isNowOpen) {
          const dockState = useRightDockStore.getState().dockStateByThreadId[threadId];
          if (dockState?.open) useRightDockStore.getState().setDockOpen(threadId, false);
        }
        return;
      }

      if (item.command === "browser") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        useRightDockStore.getState().openPane(threadId, { kind: "browser" });
        return;
      }

      if (item.command === "doctor" || item.command === "theme") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        void navigate({ to: "/settings" });
        return;
      }

      if (item.command === "test" || item.command === "analyze" || item.command === "build") {
        const applied = clearSlashCommandFromComposer();
        if (!wasPromptReplacementApplied(applied)) {
          return;
        }
        editorActions.setComposerHighlightedItemId(null);
        usePreviewStageStore.getState().open(threadId);
        {
          const dockState = useRightDockStore.getState().dockStateByThreadId[threadId];
          if (dockState?.open) useRightDockStore.getState().setDockOpen(threadId, false);
        }
        if (item.command === "test") {
          void ensureNativeApi()
            .preview.test({ threadId })
            .then((result) => {
              toastManager.add({
                type: "success",
                title: "Flutter tests finished",
                description: `${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`,
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Flutter test failed",
                description: error instanceof Error ? error.message : "Could not run tests.",
              });
            });
        } else if (item.command === "analyze") {
          void ensureNativeApi()
            .preview.analyze({ threadId })
            .then((result) => {
              toastManager.add({
                type: result.clean ? "success" : "warning",
                title: "Flutter analyze finished",
                description: result.clean
                  ? "No analyzer issues found"
                  : `${result.issues.length} issue(s) found`,
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Flutter analyze failed",
                description:
                  error instanceof Error ? error.message : "Could not run flutter analyze.",
              });
            });
        } else {
          const buildArgs = parseBuildSlashCommandArgs("");
          if (
            !buildArgs ||
            buildArgs.invalid ||
            buildArgs.target === null ||
            buildArgs.channel === null
          ) {
            return;
          }
          const buildTarget = buildArgs.target;
          const buildChannel = buildArgs.channel;
          void ensureNativeApi()
            .preview.buildStart({ threadId, target: buildTarget, channel: buildChannel })
            .then(() => {
              toastManager.add({
                type: "success",
                title: `Build started (${buildTarget}/${buildChannel})`,
                description: "Track progress in the preview quality gate.",
              });
            })
            .catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: "Build failed to start",
                description: error instanceof Error ? error.message : "Could not start build.",
              });
            });
        }
        return;
      }

      const replacement = `/${item.command} `;
      const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
        snapshot.value,
        trigger.rangeEnd,
        replacement,
      );
      const applied = editorActions.applyPromptReplacement(
        trigger.rangeStart,
        replacementRangeEnd,
        replacement,
        { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
      );
      if (wasPromptReplacementApplied(applied)) {
        editorActions.setComposerHighlightedItemId(null);
        editorActions.scheduleComposerFocus();
      }
    },
    [
      compactProviderThread,
      createSidechatFromSlashCommand,
      editorActions,
      handleClearConversation,
      handleInteractionModeChange,
      openForkTargetPicker,
      openFeedbackDialog,
      openModelPicker,
      openReviewTargetPicker,
      selectedProvider,
      supportsTextNativeReviewCommand,
      runExportSlashCommand,
      runFastSlashCommand,
      openGoalsPane,
      navigate,
    ],
  );

  return {
    handleForkTargetSelection,
    handleReviewTargetSelection,
    isSlashStatusDialogOpen,
    setIsSlashStatusDialogOpen,
    handleStandaloneSlashCommand,
    handleSlashCommandSelection,
  };
}
