import type { ModelSelection, OrchestrationSession, RuntimeMode, ThreadId } from "@caide/contracts";
import { coerceProviderKind } from "@caide/shared/model";

export function deriveTurnStartModelSelection(input: {
  readonly currentModelSelection: ModelSelection;
  readonly requestedModelSelection:
    | ModelSelection
    | { readonly provider: string; readonly model: string; readonly options?: unknown }
    | undefined;
  readonly canAdoptRequestedProvider: boolean;
}): ModelSelection {
  const requested = input.requestedModelSelection;
  if (!requested) {
    return input.currentModelSelection;
  }
  const provider = coerceProviderKind(requested.provider);
  const normalizedRequested: ModelSelection = {
    provider,
    model: requested.model,
    ...(requested.options !== undefined ? { options: requested.options } : {}),
  } as ModelSelection;

  return normalizedRequested.provider === input.currentModelSelection.provider ||
    input.canAdoptRequestedProvider
    ? normalizedRequested
    : input.currentModelSelection;
}

export function deriveTurnStartSession(input: {
  readonly threadId: ThreadId;
  readonly currentSession: OrchestrationSession | null;
  readonly providerName: OrchestrationSession["providerName"];
  readonly requestedRuntimeMode: RuntimeMode;
  readonly requestedAt: string;
}): OrchestrationSession | null {
  if (input.currentSession?.status === "starting" || input.currentSession?.status === "running") {
    return null;
  }

  return {
    threadId: input.threadId,
    status: "starting",
    providerName: input.currentSession?.providerName ?? input.providerName,
    runtimeMode: input.currentSession?.runtimeMode ?? input.requestedRuntimeMode,
    activeTurnId: null,
    lastError: null,
    updatedAt: input.requestedAt,
  };
}
