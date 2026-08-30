import { Schema } from "effect";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";
import {
  GitActionProgressEvent,
  GitCheckoutInput,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitHubRepositoryInput,
  GitHandoffThreadInput,
  GitPreparePullRequestThreadInput,
  GitCreateWorktreeInput,
  GitInitInput,
  GitListBranchesInput,
  GitPullInput,
  GitPullRequestRefInput,
  GitPullRequestSnapshotInput,
  GitReadWorkingTreeDiffInput,
  GitRemoveWorktreeInput,
  GitRemoveIndexLockInput,
  GitRunStackedActionInput,
  GitStageFilesInput,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStatusInput,
  GitSummarizeDiffInput,
  GitUnstageFilesInput,
  GitWorktreeSetupProgressEvent,
} from "./git";
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
import { KeybindingRule } from "./keybindings";
import {
  ProjectCreateLocalFilePreviewGrantInput,
  ProjectDevServerEvent,
  ProjectDiscoverScriptsInput,
  ProjectListDirectoriesInput,
  ProjectReadFileInput,
  ProjectResolveOutOfRootFileReferenceInput,
  ProjectRunDevServerInput,
  ProjectSearchEntriesInput,
  ProjectSearchLocalEntriesInput,
  ProjectStopDevServerInput,
  ProjectWriteFileInput,
} from "./project";
import { FilesystemBrowseInput } from "./filesystem";
import {
  DEVICE_WS_CHANNELS,
  DEVICE_WS_METHODS,
  DeviceAttachInput,
  DeviceBootInput,
  DeviceDescribeUiInput,
  DeviceScrollToElementInput,
  DeviceDetachInput,
  DeviceEvent,
  DeviceInstallAppInput,
  DeviceKeyEventInput,
  DeviceLaunchAppInput,
  DeviceListInput,
  DeviceOpenUrlInput,
  DevicePressButtonInput,
  DeviceScreenshotInput,
  DeviceShutdownInput,
  DeviceStartRecordingInput,
  DeviceStopRecordingInput,
  DeviceSwipeInput,
  DeviceTapInput,
  DeviceThreadInput,
  DeviceTypeTextInput,
} from "./device";
import {
  PREVIEW_WS_METHODS,
  PreviewInitInput,
  PreviewWriteFileInput,
  PreviewDeleteFileInput,
  PreviewRenameFileInput,
  PreviewListFilesInput,
  PreviewReadFileInput,
  PreviewFingerprintInput,
  PreviewEvent,
} from "./preview";
import {
  ARTIFACTS_WS_METHODS,
  ArtifactsListInput,
  ArtifactsReadInput,
  ArtifactsDeleteInput,
} from "./artifacts";
import { HarnessEvent } from "./harnessEvents";

export const WS_NEGOTIATE_HTTP_PATH = "/ws/negotiate";
export const WS_BOOTSTRAP_PATH = "/ws/bootstrap";
export const WS_FEATURE_PATH = "/ws/feature";
export const WS_BOOTSTRAP_METHOD = "bootstrap.negotiate" as const;

export const WS_CHANNELS = {
  harness: "harness.events",
  gitActionProgress: "git.actionProgress",
  gitWorktreeSetupProgress: "git.worktreeSetupProgress",
  terminalEvents: "terminal.events",
  projectDevServerEvents: "projects.devServerEvents",
  serverLifecycle: "server.lifecycle",
  serverConfig: "server.config",
  deviceEvents: DEVICE_WS_CHANNELS.events,
} as const;

export const WS_METHODS = {
  ...DEVICE_WS_METHODS,
  ...PREVIEW_WS_METHODS,
  ...ARTIFACTS_WS_METHODS,
  gitCheckout: "git.checkout",
  gitCreateBranch: "git.createBranch",
  gitCreateDetachedWorktree: "git.createDetachedWorktree",
  gitCreateWorktree: "git.createWorktree",
  gitGithubRepository: "git.githubRepository",
  gitHandoffThread: "git.handoffThread",
  gitInit: "git.init",
  gitListBranches: "git.listBranches",
  gitPreparePullRequestThread: "git.preparePullRequestThread",
  gitPull: "git.pull",
  gitPullRequestRef: "git.pullRequestRef",
  gitPullRequestSnapshot: "git.pullRequestSnapshot",
  gitReadWorkingTreeDiff: "git.readWorkingTreeDiff",
  gitRemoveWorktree: "git.removeWorktree",
  gitRemoveIndexLock: "git.removeIndexLock",
  gitRunStackedAction: "git.runStackedAction",
  gitStageFiles: "git.stageFiles",
  gitStashAndCheckout: "git.stashAndCheckout",
  gitStashDrop: "git.stashDrop",
  gitStashInfo: "git.stashInfo",
  gitStatus: "git.status",
  gitSummarizeDiff: "git.summarizeDiff",
  gitUnstageFiles: "git.unstageFiles",
  terminalAckOutput: "terminal.ackOutput",
  terminalClear: "terminal.clear",
  terminalClose: "terminal.close",
  terminalOpen: "terminal.open",
  terminalResize: "terminal.resize",
  terminalRestart: "terminal.restart",
  terminalWrite: "terminal.write",
  projectsDiscoverScripts: "projects.discoverScripts",
  projectsListDirectories: "projects.listDirectories",
  projectsSearchEntries: "projects.searchEntries",
  projectsSearchLocalEntries: "projects.searchLocalEntries",
  projectsReadFile: "projects.readFile",
  projectsResolveOutOfRootFileReference: "projects.resolveOutOfRootFileReference",
  projectsCreateLocalFilePreviewGrant: "projects.createLocalFilePreviewGrant",
  projectsWriteFile: "projects.writeFile",
  projectsRunDevServer: "projects.runDevServer",
  projectsStopDevServer: "projects.stopDevServer",
  projectsListDevServers: "projects.listDevServers",
  subscribeProjectDevServerEvents: "projects.subscribeDevServerEvents",
  filesystemBrowse: "filesystem.browse",
} as const;

export const WebSocketRequest = Schema.Struct({
  id: Schema.String,
  method: Schema.String,
  params: Schema.optional(Schema.Unknown),
});
export type WebSocketRequest = typeof WebSocketRequest.Type;

export const WsResponse = Schema.Struct({
  id: Schema.String,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      code: Schema.Number,
      message: Schema.String,
      data: Schema.optional(Schema.Unknown),
    }),
  ),
});
export type WsResponse = typeof WsResponse.Type;
