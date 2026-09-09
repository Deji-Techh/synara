// FILE: _chat.index.tsx
// Purpose: Restores the last chat route on app launch, falling back to a fresh home-chat draft.
//          Also the landing for a Space that has nothing to open.
// Layer: Routing
// Depends on: the shared restore/create route surface plus the home-chat new-chat handler.

import { SpaceId, type AppCreateResult, type ProjectId } from "@caide/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { CreateAppDialog } from "../components/CreateAppDialog";
import {
  RestoreOrCreateChatRoute,
  type RestoreRouteResolver,
} from "../components/RestoreOrCreateChatRoute";
import { Button } from "../components/ui/button";
import { waitForSnapshotMatch } from "../lib/projectCreateRecovery";
import { readNativeApi } from "../nativeApi";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { VOID_SPACE_KEY } from "../lib/spaceGrouping";
import { resolveSplitViewThreadIds, useSplitViewStore } from "../splitViewStore";
import { EMPTY_THREAD_IDS, useStore } from "../store";
import { useWorkspacePathsStore } from "../workspacePathsStore";
import { resolveChatIndexRestoreRoute, type ChatIndexLandingSpace } from "./-chatIndexRoute.logic";

export interface ChatIndexSearch {
  readonly space?: string | undefined;
}

function EmptyWorkspacePrompt() {
  const navigate = useNavigate();
  const [createAppOpen, setCreateAppOpen] = useState(false);

  const handleAppCreated = async (result: AppCreateResult) => {
    const api = readNativeApi();
    if (!api) return;
    const { snapshot } = await waitForSnapshotMatch({
      loadSnapshot: () => api.orchestration.getShellSnapshot().catch(() => null),
      findMatch: (candidate) =>
        candidate.projects.find((project) => project.id === result.projectId) ?? null,
      maxAttempts: 6,
      delayMs: 50,
    });
    if (snapshot) {
      useStore.getState().syncServerShellSnapshot(snapshot);
    }
    await navigate({ to: "/$threadId", params: { threadId: result.threadId } });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-foreground">Create your first app</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Caide builds apps, not empty chats. Name it below and you land in its first conversation.
        </p>
      </div>
      <Button size="default" onClick={() => setCreateAppOpen(true)}>
        Create app
      </Button>
      <CreateAppDialog
        open={createAppOpen}
        onOpenChange={setCreateAppOpen}
        onCreated={(result) => void handleAppCreated(result)}
      />
    </div>
  );
}

function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const landingSpaceKey = Route.useSearch({ select: (search) => search.space });
  const threadsHydrated = useStore((state) => state.threadsHydrated);
  const threadIds = useStore((state) => state.threadIds ?? EMPTY_THREAD_IDS);
  const projects = useStore((state) => state.projects);
  const sidebarThreadSummaryById = useStore((state) => state.sidebarThreadSummaryById);
  const draftThreadsByThreadId = useComposerDraftStore((state) => state.draftThreadsByThreadId);
  const homeDir = useWorkspacePathsStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspacePathsStore((state) => state.chatWorkspaceRoot);

  const createFreshChat = () =>
    landingSpaceKey === undefined ? handleNewChat({ fresh: true }) : handleNewChat();

  const workspacePaths = { homeDir, chatWorkspaceRoot };
  const draftProjectIdByThreadId = new Map<string, ProjectId>();
  for (const [threadId, draft] of Object.entries(draftThreadsByThreadId)) {
    if (draft.entryPoint === "chat" && draft.promotedTo === undefined) {
      draftProjectIdByThreadId.set(threadId, draft.projectId);
    }
  }

  // Vacant workspace (first run, or a delete stranded the user with
  // nothing left): prompt app creation instead of minting a Home draft.
  // Hydration-gated so reloads never flash the prompt mid-sync.
  if (threadsHydrated && threadIds.length === 0 && draftProjectIdByThreadId.size === 0) {
    return <EmptyWorkspacePrompt />;
  }

  const landingSpace: ChatIndexLandingSpace | null =
    landingSpaceKey === undefined
      ? null
      : {
          spaceId: landingSpaceKey === VOID_SPACE_KEY ? null : SpaceId.makeUnsafe(landingSpaceKey),
          projectById: new Map(projects.map((project) => [project.id, project])),
          workspacePaths,
        };

  const resolveRestoreRoute: RestoreRouteResolver = ({ availableSplitViewIds }) => {
    const lastThreadRoute = readSidebarUiState().lastThreadRoute;
    const rememberedSplitView = lastThreadRoute?.splitViewId
      ? useSplitViewStore.getState().splitViewsById[lastThreadRoute.splitViewId]
      : undefined;
    return resolveChatIndexRestoreRoute({
      lastThreadRoute,
      availableSplitViewIds,
      threadIds,
      sidebarThreadSummaryById,
      draftProjectIdByThreadId,
      rememberedSplitViewThreadIds: rememberedSplitView
        ? resolveSplitViewThreadIds(rememberedSplitView)
        : undefined,
      landingSpace,
    });
  };

  return (
    <RestoreOrCreateChatRoute
      resolveRestoreRoute={resolveRestoreRoute}
      createFreshChat={createFreshChat}
    />
  );
}

export const Route = createFileRoute("/_chat/")({
  validateSearch: (raw: Record<string, unknown>): ChatIndexSearch =>
    typeof raw.space === "string" && raw.space.length > 0 ? { space: raw.space } : {},
  component: ChatIndexRouteView,
});
