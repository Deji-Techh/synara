import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { OpenInEditorInput } from "./editor";
import {
  DEVICE_WS_METHODS,
  DeviceAttachInput,
  DeviceBootInput,
  DeviceBootResult,
  DeviceDescribeUiInput,
  DeviceDescribeUiResult,
  DeviceDetachInput,
  DeviceEvent,
  DeviceInstallAppInput,
  DeviceInstallAppResult,
  DeviceKeyEventInput,
  DeviceLaunchAppInput,
  DeviceLaunchAppResult,
  DeviceListInput,
  DeviceListResult,
  DeviceOpenUrlInput,
  DevicePressButtonInput,
  DeviceScreenshotInput,
  DeviceScreenshotResult,
  DeviceStartRecordingInput,
  DeviceStartRecordingResult,
  DeviceStopRecordingInput,
  DeviceStopRecordingResult,
  DeviceShutdownInput,
  DeviceSwipeInput,
  DeviceScrollToElementInput,
  DeviceScrollToElementResult,
  DeviceTapInput,
  DeviceThreadInput,
  DeviceTypeTextInput,
  ThreadDeviceState,
} from "./device";
import { FilesystemBrowseInput, FilesystemBrowseResult } from "./filesystem";
import { AppCreateInput, AppCreateResult } from "./caideApps";
import {
  GitHubProjectProvisionInput,
  GitHubProjectProvisionProgressEvent,
} from "./githubProjectProvisioning";
import {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitHubRepositoryInput,
  GitHubRepositoryResult,
  GitHandoffThreadInput,
  GitHandoffThreadResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullInput,
  GitPullRequestRefInput,
  GitPullRequestSnapshotInput,
  GitPullRequestSnapshotResult,
  GitPullResult,
  GitReadWorkingTreeDiffInput,
  GitReadWorkingTreeDiffResult,
  GitWorkingTreeDiffStatsResult,
  GitRemoveIndexLockInput,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitStageFilesInput,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStashInfoResult,
  GitStatusInput,
  GitStatusResult,
  GitSummarizeDiffInput,
  GitSummarizeDiffResult,
  GitUnstageFilesInput,
  GitWorktreeSetupProgressEvent,
} from "./git";
import { KeybindingRule, KeybindingsConfig } from "./keybindings";
import {
  PREVIEW_WS_METHODS,
  PreviewStartInput,
  PreviewStartResult,
  PreviewStopInput,
  PreviewStopResult,
  PreviewReloadInput,
  PreviewReloadResult,
  PreviewGetStateInput,
  PreviewState,
  PreviewScreenshotInput,
  PreviewScreenshotResult,
} from "./preview";
import {
  ARTIFACTS_WS_METHODS,
  ArtifactsListInput,
  ArtifactsListResult,
  ArtifactsRenameInput,
  ArtifactsRenameResult,
  ArtifactsDeleteInput,
  ArtifactsDeleteResult,
  ArtifactsShareUrlInput,
  ArtifactsShareUrlResult,
} from "./artifacts";
import {
  ProjectCreateLocalFilePreviewGrantInput,
  ProjectCreateLocalFilePreviewGrantResult,
  ProjectDevServerEvent,
  ProjectDiscoverScriptsInput,
  ProjectDiscoverScriptsResult,
  ProjectListDirectoriesInput,
  ProjectListDirectoriesResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectResolveOutOfRootFileReferenceInput,
  ProjectResolveOutOfRootFileReferenceResult,
  ProjectRunDevServerInput,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSearchLocalEntriesInput,
  ProjectSearchLocalEntriesResult,
  ProjectStopDevServerInput,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import {
  ServerConfigStreamEvent,
  ServerDiagnosticsResult,
  ServerLifecycleStreamEvent,
} from "./server";
import {
  ServerSettings,
  ServerSettingsPatch,
  ServerSettingsView,
} from "./settings";
import {
  TerminalAckOutputInput,
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalWriteInput,
} from "./terminal";
import {
  WS_BOOTSTRAP_METHOD,
  WS_METHODS,
} from "./ws";
import { WsRpcError } from "./wsRpcError";

export { WsRpcError } from "./wsRpcError";

// ── Preview RPC Group ───────────────────────────────────────────────────

export const WsPreviewStartRpc = Rpc.make(PREVIEW_WS_METHODS.start, {
  payload: PreviewStartInput,
  success: PreviewStartResult,
  error: WsRpcError,
});

export const WsPreviewStopRpc = Rpc.make(PREVIEW_WS_METHODS.stop, {
  payload: PreviewStopInput,
  success: PreviewStopResult,
  error: WsRpcError,
});

export const WsPreviewReloadRpc = Rpc.make(PREVIEW_WS_METHODS.reload, {
  payload: PreviewReloadInput,
  success: PreviewReloadResult,
  error: WsRpcError,
});

export const WsPreviewGetStateRpc = Rpc.make(PREVIEW_WS_METHODS.getState, {
  payload: PreviewGetStateInput,
  success: PreviewState,
  error: WsRpcError,
});

export const WsPreviewScreenshotRpc = Rpc.make(PREVIEW_WS_METHODS.screenshot, {
  payload: PreviewScreenshotInput,
  success: PreviewScreenshotResult,
  error: WsRpcError,
});

export const WsPreviewRpcGroup = RpcGroup.make(
  WsPreviewStartRpc,
  WsPreviewStopRpc,
  WsPreviewReloadRpc,
  WsPreviewGetStateRpc,
  WsPreviewScreenshotRpc,
);

// ── Artifacts RPC Group ─────────────────────────────────────────────────

export const WsArtifactsListRpc = Rpc.make(ARTIFACTS_WS_METHODS.list, {
  payload: ArtifactsListInput,
  success: ArtifactsListResult,
  error: WsRpcError,
});

export const WsArtifactsRenameRpc = Rpc.make(ARTIFACTS_WS_METHODS.rename, {
  payload: ArtifactsRenameInput,
  success: ArtifactsRenameResult,
  error: WsRpcError,
});

export const WsArtifactsDeleteRpc = Rpc.make(ARTIFACTS_WS_METHODS.delete, {
  payload: ArtifactsDeleteInput,
  success: ArtifactsDeleteResult,
  error: WsRpcError,
});

export const WsArtifactsShareUrlRpc = Rpc.make(ARTIFACTS_WS_METHODS.shareUrl, {
  payload: ArtifactsShareUrlInput,
  success: ArtifactsShareUrlResult,
  error: WsRpcError,
});

export const WsArtifactsRpcGroup = RpcGroup.make(
  WsArtifactsListRpc,
  WsArtifactsRenameRpc,
  WsArtifactsDeleteRpc,
  WsArtifactsShareUrlRpc,
);

// ── Device RPC Group ────────────────────────────────────────────────────

export const WsDeviceListRpc = Rpc.make(DEVICE_WS_METHODS.list, {
  payload: DeviceListInput,
  success: DeviceListResult,
  error: WsRpcError,
});

export const WsDeviceBootRpc = Rpc.make(DEVICE_WS_METHODS.boot, {
  payload: DeviceBootInput,
  success: DeviceBootResult,
  error: WsRpcError,
});

export const WsDeviceShutdownRpc = Rpc.make(DEVICE_WS_METHODS.shutdown, {
  payload: DeviceShutdownInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceInstallAppRpc = Rpc.make(DEVICE_WS_METHODS.installApp, {
  payload: DeviceInstallAppInput,
  success: DeviceInstallAppResult,
  error: WsRpcError,
});

export const WsDeviceLaunchAppRpc = Rpc.make(DEVICE_WS_METHODS.launchApp, {
  payload: DeviceLaunchAppInput,
  success: DeviceLaunchAppResult,
  error: WsRpcError,
});

export const WsDeviceOpenUrlRpc = Rpc.make(DEVICE_WS_METHODS.openUrl, {
  payload: DeviceOpenUrlInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceScreenshotRpc = Rpc.make(DEVICE_WS_METHODS.screenshot, {
  payload: DeviceScreenshotInput,
  success: DeviceScreenshotResult,
  error: WsRpcError,
});

export const WsDeviceTapRpc = Rpc.make(DEVICE_WS_METHODS.tap, {
  payload: DeviceTapInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceSwipeRpc = Rpc.make(DEVICE_WS_METHODS.swipe, {
  payload: DeviceSwipeInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceTypeXmlRpc = Rpc.make(DEVICE_WS_METHODS.typeText, {
  payload: DeviceTypeTextInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDevicePressButtonRpc = Rpc.make(DEVICE_WS_METHODS.pressButton, {
  payload: DevicePressButtonInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceKeyEventRpc = Rpc.make(DEVICE_WS_METHODS.keyEvent, {
  payload: DeviceKeyEventInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceDescribeUiRpc = Rpc.make(DEVICE_WS_METHODS.describeUi, {
  payload: DeviceDescribeUiInput,
  success: DeviceDescribeUiResult,
  error: WsRpcError,
});

export const WsDeviceScrollToElementRpc = Rpc.make(DEVICE_WS_METHODS.scrollToElement, {
  payload: DeviceScrollToElementInput,
  success: DeviceScrollToElementResult,
  error: WsRpcError,
});

export const WsDeviceStartRecordingRpc = Rpc.make(DEVICE_WS_METHODS.startRecording, {
  payload: DeviceStartRecordingInput,
  success: DeviceStartRecordingResult,
  error: WsRpcError,
});

export const WsDeviceStopRecordingRpc = Rpc.make(DEVICE_WS_METHODS.stopRecording, {
  payload: DeviceStopRecordingInput,
  success: DeviceStopRecordingResult,
  error: WsRpcError,
});

export const WsDeviceAttachRpc = Rpc.make(DEVICE_WS_METHODS.attach, {
  payload: DeviceAttachInput,
  success: ThreadDeviceState,
  error: WsRpcError,
});

export const WsDeviceDetachRpc = Rpc.make(DEVICE_WS_METHODS.detach, {
  payload: DeviceDetachInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsDeviceGetThreadStateRpc = Rpc.make(DEVICE_WS_METHODS.getThreadState, {
  payload: DeviceThreadInput,
  success: Schema.Option(ThreadDeviceState),
  error: WsRpcError,
});

export const WsDeviceSubscribeEventsRpc = Rpc.make(DEVICE_WS_METHODS.subscribeEvents, {
  payload: Schema.Struct({}),
  success: DeviceEvent,
  error: WsRpcError,
  stream: true,
});

export const WsDeviceRpcGroup = RpcGroup.make(
  WsDeviceListRpc,
  WsDeviceBootRpc,
  WsDeviceShutdownRpc,
  WsDeviceInstallAppRpc,
  WsDeviceLaunchAppRpc,
  WsDeviceOpenUrlRpc,
  WsDeviceScreenshotRpc,
  WsDeviceTapRpc,
  WsDeviceSwipeRpc,
  WsDeviceTypeXmlRpc,
  WsDevicePressButtonRpc,
  WsDeviceKeyEventRpc,
  WsDeviceDescribeUiRpc,
  WsDeviceScrollToElementRpc,
  WsDeviceStartRecordingRpc,
  WsDeviceStopRecordingRpc,
  WsDeviceAttachRpc,
  WsDeviceDetachRpc,
  WsDeviceGetThreadStateRpc,
  WsDeviceSubscribeEventsRpc,
);

// ── Bootstrap RPC ───────────────────────────────────────────────────────

export const WsBootstrapNegotiateRpc = Rpc.make(WS_BOOTSTRAP_METHOD, {
  payload: Schema.Struct({ clientVersion: Schema.String }),
  success: Schema.Struct({ serverVersion: Schema.String, ok: Schema.Boolean }),
  error: WsRpcError,
});

export const WsBootstrapRpcGroup = RpcGroup.make(WsBootstrapNegotiateRpc);

// ── Feature RPCs (Projects, Git, Terminal, Server) ───────────────────────

export const WsProjectsDiscoverScriptsRpc = Rpc.make(WS_METHODS.projectsDiscoverScripts, {
  payload: ProjectDiscoverScriptsInput,
  success: ProjectDiscoverScriptsResult,
  error: WsRpcError,
});

export const WsProjectsListDirectoriesRpc = Rpc.make(WS_METHODS.projectsListDirectories, {
  payload: ProjectListDirectoriesInput,
  success: ProjectListDirectoriesResult,
  error: WsRpcError,
});

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: WsRpcError,
});

export const WsProjectsSearchLocalEntriesRpc = Rpc.make(WS_METHODS.projectsSearchLocalEntries, {
  payload: ProjectSearchLocalEntriesInput,
  success: ProjectSearchLocalEntriesResult,
  error: WsRpcError,
});

export const WsProjectsReadFileRpc = Rpc.make(WS_METHODS.projectsReadFile, {
  payload: ProjectReadFileInput,
  success: ProjectReadFileResult,
  error: WsRpcError,
});

export const WsProjectsResolveOutOfRootFileReferenceRpc = Rpc.make(
  WS_METHODS.projectsResolveOutOfRootFileReference,
  {
    payload: ProjectResolveOutOfRootFileReferenceInput,
    success: ProjectResolveOutOfRootFileReferenceResult,
    error: WsRpcError,
  },
);

export const WsProjectsCreateLocalFilePreviewGrantRpc = Rpc.make(
  WS_METHODS.projectsCreateLocalFilePreviewGrant,
  {
    payload: ProjectCreateLocalFilePreviewGrantInput,
    success: ProjectCreateLocalFilePreviewGrantResult,
    error: WsRpcError,
  },
);

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: WsRpcError,
});

export const WsProjectsRunDevServerRpc = Rpc.make(WS_METHODS.projectsRunDevServer, {
  payload: ProjectRunDevServerInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsProjectsStopDevServerRpc = Rpc.make(WS_METHODS.projectsStopDevServer, {
  payload: ProjectStopDevServerInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsProjectsListDevServersRpc = Rpc.make(WS_METHODS.projectsListDevServers, {
  payload: Schema.Struct({}),
  success: Schema.Array(Schema.Unknown),
  error: WsRpcError,
});

export const WsSubscribeProjectDevServerEventsRpc = Rpc.make(
  WS_METHODS.subscribeProjectDevServerEvents,
  {
    payload: Schema.Struct({}),
    success: ProjectDevServerEvent,
    error: WsRpcError,
    stream: true,
  },
);

export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: WsRpcError,
});

export const WsShellOpenInEditorRpc = Rpc.make("shell.openInEditor", {
  payload: OpenInEditorInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitGithubRepositoryRpc = Rpc.make(WS_METHODS.gitGithubRepository, {
  payload: GitHubRepositoryInput,
  success: GitHubRepositoryResult,
  error: WsRpcError,
});

export const WsGitStatusRpc = Rpc.make(WS_METHODS.gitStatus, {
  payload: GitStatusInput,
  success: GitStatusResult,
  error: WsRpcError,
});

export const WsGitReadWorkingTreeDiffRpc = Rpc.make(WS_METHODS.gitReadWorkingTreeDiff, {
  payload: GitReadWorkingTreeDiffInput,
  success: GitReadWorkingTreeDiffResult,
  error: WsRpcError,
});

export const WsGitWorkingTreeDiffStatsRpc = Rpc.make("git.workingTreeDiffStats", {
  payload: GitReadWorkingTreeDiffInput,
  success: GitWorkingTreeDiffStatsResult,
  error: WsRpcError,
});

export const WsGitSummarizeDiffRpc = Rpc.make(WS_METHODS.gitSummarizeDiff, {
  payload: GitSummarizeDiffInput,
  success: GitSummarizeDiffResult,
  error: WsRpcError,
});

export const WsGitPullRpc = Rpc.make(WS_METHODS.gitPull, {
  payload: GitPullInput,
  success: GitPullResult,
  error: WsRpcError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitCreateBranchRpc = Rpc.make(WS_METHODS.gitCreateBranch, {
  payload: GitCreateBranchInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitCheckoutRpc = Rpc.make(WS_METHODS.gitCheckout, {
  payload: GitCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashAndCheckoutRpc = Rpc.make(WS_METHODS.gitStashAndCheckout, {
  payload: GitStashAndCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashDropRpc = Rpc.make(WS_METHODS.gitStashDrop, {
  payload: GitStashDropInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashInfoRpc = Rpc.make(WS_METHODS.gitStashInfo, {
  payload: GitStashInfoInput,
  success: GitStashInfoResult,
  error: WsRpcError,
});

export const WsGitStageFilesRpc = Rpc.make(WS_METHODS.gitStageFiles, {
  payload: GitStageFilesInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitUnstageFilesRpc = Rpc.make(WS_METHODS.gitUnstageFiles, {
  payload: GitUnstageFilesInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitInitRpc = Rpc.make(WS_METHODS.gitInit, {
  payload: GitInitInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitListBranchesRpc = Rpc.make(WS_METHODS.gitListBranches, {
  payload: GitListBranchesInput,
  success: GitListBranchesResult,
  error: WsRpcError,
});

export const WsGitCreateWorktreeRpc = Rpc.make(WS_METHODS.gitCreateWorktree, {
  payload: GitCreateWorktreeInput,
  success: GitCreateWorktreeResult,
  error: WsRpcError,
});

export const WsGitCreateDetachedWorktreeRpc = Rpc.make(WS_METHODS.gitCreateDetachedWorktree, {
  payload: GitCreateDetachedWorktreeInput,
  success: GitCreateWorktreeResult,
  error: WsRpcError,
});

export const WsGitRemoveWorktreeRpc = Rpc.make(WS_METHODS.gitRemoveWorktree, {
  payload: GitRemoveWorktreeInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitRemoveIndexLockRpc = Rpc.make(WS_METHODS.gitRemoveIndexLock, {
  payload: GitRemoveIndexLockInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsSubscribeGitActionProgressRpc = Rpc.make("git.subscribeActionProgress", {
  payload: Schema.Struct({}),
  success: GitActionProgressEvent,
  error: WsRpcError,
  stream: true,
});

export const WsSubscribeGitWorktreeSetupProgressRpc = Rpc.make(
  "git.subscribeWorktreeSetupProgress",
  {
    payload: Schema.Struct({}),
    success: GitWorktreeSetupProgressEvent,
    error: WsRpcError,
    stream: true,
  },
);

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalAckOutputRpc = Rpc.make(WS_METHODS.terminalAckOutput, {
  payload: TerminalAckOutputInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsSubscribeTerminalEventsRpc = Rpc.make("terminal.subscribeEvents", {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  error: WsRpcError,
  stream: true,
});

export const WsKeybindingsGetConfigRpc = Rpc.make("keybindings.getConfig", {
  payload: Schema.Struct({}),
  success: KeybindingsConfig,
  error: WsRpcError,
});

export const WsKeybindingsUpdateRulesRpc = Rpc.make("keybindings.updateRules", {
  payload: Schema.Struct({ rules: Schema.Array(KeybindingRule) }),
  success: Schema.Void,
  error: WsRpcError,
});

export const WsServerGetDiagnosticsRpc = Rpc.make("server.getDiagnostics", {
  payload: Schema.Struct({}),
  success: ServerDiagnosticsResult,
  error: WsRpcError,
});

export const WsServerGetSettingsRpc = Rpc.make("server.getSettings", {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: WsRpcError,
});

export const WsServerGetSettingsViewRpc = Rpc.make("server.getSettingsView", {
  payload: Schema.Struct({}),
  success: ServerSettingsView,
  error: WsRpcError,
});

export const WsServerUpdateSettingsRpc = Rpc.make("server.updateSettings", {
  payload: Schema.Struct({ patch: ServerSettingsPatch }),
  success: ServerSettings,
  error: WsRpcError,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make("server.subscribeLifecycle", {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  error: WsRpcError,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make("server.subscribeConfig", {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: WsRpcError,
  stream: true,
});

export const WsFeatureRpcGroup = RpcGroup.make(
  WsProjectsDiscoverScriptsRpc,
  WsProjectsListDirectoriesRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsSearchLocalEntriesRpc,
  WsProjectsReadFileRpc,
  WsProjectsResolveOutOfRootFileReferenceRpc,
  WsProjectsCreateLocalFilePreviewGrantRpc,
  WsProjectsWriteFileRpc,
  WsProjectsRunDevServerRpc,
  WsProjectsStopDevServerRpc,
  WsProjectsListDevServersRpc,
  WsSubscribeProjectDevServerEventsRpc,
  WsFilesystemBrowseRpc,
  WsShellOpenInEditorRpc,
  WsGitGithubRepositoryRpc,
  WsGitStatusRpc,
  WsGitReadWorkingTreeDiffRpc,
  WsGitWorkingTreeDiffStatsRpc,
  WsGitSummarizeDiffRpc,
  WsGitPullRpc,
  WsGitRunStackedActionRpc,
  WsGitCreateBranchRpc,
  WsGitCheckoutRpc,
  WsGitStashAndCheckoutRpc,
  WsGitStashDropRpc,
  WsGitStashInfoRpc,
  WsGitStageFilesRpc,
  WsGitUnstageFilesRpc,
  WsGitInitRpc,
  WsGitListBranchesRpc,
  WsGitCreateWorktreeRpc,
  WsGitCreateDetachedWorktreeRpc,
  WsGitRemoveWorktreeRpc,
  WsGitRemoveIndexLockRpc,
  WsSubscribeGitActionProgressRpc,
  WsSubscribeGitWorktreeSetupProgressRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalAckOutputRpc,
  WsTerminalResizeRpc,
  WsTerminalRestartRpc,
  WsTerminalClearRpc,
  WsTerminalCloseRpc,
  WsSubscribeTerminalEventsRpc,
  WsKeybindingsGetConfigRpc,
  WsKeybindingsUpdateRulesRpc,
  WsServerGetDiagnosticsRpc,
  WsServerGetSettingsRpc,
  WsServerGetSettingsViewRpc,
  WsServerUpdateSettingsRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeServerConfigRpc,
);

export const WsRpcGroup = RpcGroup.merge(
  WsBootstrapRpcGroup,
  WsFeatureRpcGroup,
  WsDeviceRpcGroup,
  WsPreviewRpcGroup,
  WsArtifactsRpcGroup,
);
