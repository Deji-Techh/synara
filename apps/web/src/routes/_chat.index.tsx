// FILE: _chat.index.tsx
// Purpose: Restores last chat route or shows Flutter-first dashboard when nothing to restore.
// Layer: Routing

import { SpaceId, type ProjectId } from "@caide/contracts";
import { createFileRoute } from "@tanstack/react-router";

import {
  RestoreOrCreateChatRoute,
  type RestoreRouteResolver,
} from "../components/RestoreOrCreateChatRoute";
import { HomeDashboard } from "../components/home/HomeDashboard";
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

function ChatIndexRouteView() {
  const { handleNewChat } = useHandleNewChat();
  const landingSpaceKey = Route.useSearch({ select: (search) => search.space });
  const threadIds = useStore((state) => state.threadIds ?? EMPTY_THREAD_IDS);
  const projects = useStore((state) => state.projects);
  const threadsHydrated = useStore((state) => state.threadsHydrated);
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

  // Flutter-first: when hydrated and there is no thread to restore, show the dashboard
  // instead of auto-minting a blank chat that litters the Chats container.
  const hasRestoreTarget = (() => {
    try {
      const r = resolveRestoreRoute({
        availableSplitViewIds: new Set(Object.keys(useSplitViewStore.getState().splitViewsById)),
      });
      return r !== null;
    } catch {
      return false;
    }
  })();

  if (threadsHydrated && !hasRestoreTarget && landingSpaceKey === undefined) {
    return <HomeDashboard />;
  }

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
