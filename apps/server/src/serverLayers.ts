import * as NodeServices from "@effect/platform-node/NodeServices";
import { Layer } from "effect";

import { DeviceServiceLive } from "./device/Layers/DeviceService";
import { KeybindingsLive } from "./keybindings";
import { GitCoreLive } from "./git/Layers/GitCore";
import { GitHubCliLive } from "./git/Layers/GitHubCli";
import { GitManagerLive } from "./git/Layers/GitManager";
import { GitStatusBroadcasterLive } from "./git/Layers/GitStatusBroadcaster";
import { TextGenerationLayerLive } from "./git/runtimeLayer";
import { TerminalLayerLive } from "./terminal/runtimeLayer";
import { AuthControlPlaneLive } from "./auth/Layers/AuthControlPlane";
import { BootstrapCredentialServiceLive } from "./auth/Layers/BootstrapCredentialService";
import { ServerAuthLive } from "./auth/Layers/ServerAuth";
import { ServerAuthPolicyLive } from "./auth/Layers/ServerAuthPolicy";
import { ServerSecretStoreLive } from "./auth/Layers/ServerSecretStore";
import { SessionCredentialServiceLive } from "./auth/Layers/SessionCredentialService";
import { ServerLifecycleEventsLive } from "./serverLifecycleEvents";
import { ServerRuntimeStartupLive } from "./serverRuntimeStartup";
import { ServerSettingsLive } from "./serverSettings";
import { ProviderCredentialsLive } from "./providerCredentials";
import { WorkspaceLayerLive } from "./workspace/runtimeLayer";
import { DevServerManagerLive } from "./devServerManager";
import { ProjectFaviconResolverLive } from "./project/Layers/ProjectFaviconResolver";
import { ServerEnvironmentLive } from "./environment/Layers/ServerEnvironment";
import { ToolchainDoctorLive } from "./toolchain/Layers/ToolchainDoctor";
import { ArtifactRegistryLive } from "./persistence/Layers/ArtifactRegistry";
import { ProjectPullRequestPinsLive } from "./persistence/Layers/ProjectPullRequestPins";
import { PullRequestServiceLive } from "./pullRequests/Layers/PullRequestService";
import { ThreadDiagnosticsQueryLive } from "./diagnostics/Layers/ThreadDiagnosticsQuery";
import { WsConnectionSessionsLive } from "./wsConnectionSessions";
import { OpenLive } from "./open";
import { ServerConfig } from "./config";
import { ServerLoggerLive } from "./serverLogger";
import {
  AutomationService,
  CheckpointDiffQuery,
  OrchestrationEngineService,
  ProviderCommandReactor,
  ProjectionSnapshotQuery,
  ProfileStatsQuery,
  ExternalMcpService,
  ProviderAdapterRegistry,
  ProviderDiscoveryService,
  ProviderHealth,
  ProviderService,
} from "./harnessCompat";

export function makeServerRuntimeServicesLayer(
  configLayer: Layer.Layer<ServerConfig>,
  sqliteLayer: Layer.Layer<any>,
) {
  const base = Layer.merge(configLayer, NodeServices.layer);
  const logger = ServerLoggerLive.pipe(Layer.provide(base));
  let current = Layer.provideMerge(sqliteLayer, Layer.merge(base, logger));

  const layerList: Array<Layer.Layer<any, any, any>> = [
    ServerSecretStoreLive,
    SessionCredentialServiceLive,
    BootstrapCredentialServiceLive,
    AuthControlPlaneLive,
    ServerAuthPolicyLive,
    ServerAuthLive,
    ProviderCredentialsLive,
    ServerSettingsLive,
    DeviceServiceLive,
    TextGenerationLayerLive,
    GitHubCliLive,
    GitCoreLive,
    GitManagerLive,
    GitStatusBroadcasterLive,
    TerminalLayerLive,
    KeybindingsLive,
    ServerEnvironmentLive,
    ToolchainDoctorLive,
    ServerLifecycleEventsLive,
    ServerRuntimeStartupLive,
    WorkspaceLayerLive,
    DevServerManagerLive,
    ProjectFaviconResolverLive,
    ArtifactRegistryLive,
    ProjectPullRequestPinsLive,
    ThreadDiagnosticsQueryLive,
    WsConnectionSessionsLive,
    OpenLive,
    AutomationService.layer,
    CheckpointDiffQuery.layer,
    OrchestrationEngineService.layer,
    ProviderCommandReactor.layer,
    ProjectionSnapshotQuery.layer,
    ProfileStatsQuery.layer,
    ExternalMcpService.layer,
    ProviderAdapterRegistry.layer,
    ProviderDiscoveryService.layer,
    ProviderHealth.layer,
    ProviderService.layer,
    PullRequestServiceLive,
  ];

  for (const l of layerList) {
    current = Layer.provideMerge(l, current);
  }

  return current;
}

export function makeServerApplicationLayers(
  configLayer: Layer.Layer<ServerConfig>,
  sqliteLayer: Layer.Layer<any>,
) {
  return {
    runtimeServicesLayer: makeServerRuntimeServicesLayer(configLayer, sqliteLayer),
  } as const;
}
