import * as NodeServices from "@effect/platform-node/NodeServices";
import { Layer } from "effect";

import { DeviceServiceLive } from "./device/Layers/DeviceService";
import { KeybindingsLive } from "./keybindings";
import { GitCoreLive } from "./git/Layers/GitCore";
import { GitLayerLive, TextGenerationLayerLive } from "./git/runtimeLayer";
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
import { ProjectFaviconResolverLive } from "./project/Layers/ProjectFaviconResolver";
import { ServerEnvironmentLive } from "./environment/Layers/ServerEnvironment";
import { ToolchainDoctorLive } from "./toolchain/Layers/ToolchainDoctor";
import { ArtifactRegistryLive } from "./persistence/Layers/ArtifactRegistry";

export function makeServerRuntimeServicesLayer() {
  const sessionCredentialLayer = SessionCredentialServiceLive.pipe(
    Layer.provide(ServerSecretStoreLive),
  );
  const authControlPlaneLayer = AuthControlPlaneLive.pipe(
    Layer.provide(BootstrapCredentialServiceLive),
    Layer.provide(sessionCredentialLayer),
  );
  const serverAuthLayer = ServerAuthLive.pipe(
    Layer.provide(ServerAuthPolicyLive),
    Layer.provide(BootstrapCredentialServiceLive),
    Layer.provide(sessionCredentialLayer),
    Layer.provide(authControlPlaneLayer),
  );
  const authServicesLayer = Layer.mergeAll(
    ServerAuthPolicyLive,
    ServerSecretStoreLive,
    BootstrapCredentialServiceLive,
    sessionCredentialLayer,
    authControlPlaneLayer,
    serverAuthLayer,
  );

  const providerCredentialsLayer = ProviderCredentialsLive.pipe(
    Layer.provide(ServerSecretStoreLive),
  );

  const serverSettingsLayer = ServerSettingsLive.pipe(
    Layer.provide(providerCredentialsLayer),
  );

  return Layer.mergeAll(
    ArtifactRegistryLive,
    DeviceServiceLive,
    GitLayerLive,
    GitCoreLive,
    TextGenerationLayerLive,
    TerminalLayerLive,
    KeybindingsLive,
    serverSettingsLayer,
    providerCredentialsLayer,
    ServerEnvironmentLive,
    ToolchainDoctorLive,
    authServicesLayer,
    ServerLifecycleEventsLive,
    ServerRuntimeStartupLive,
    WorkspaceLayerLive,
    ProjectFaviconResolverLive,
  ).pipe(Layer.provideMerge(NodeServices.layer));
}

export function makeServerApplicationLayers() {
  return {
    runtimeServicesLayer: makeServerRuntimeServicesLayer(),
  } as const;
}
