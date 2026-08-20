import type { ModelSelection, ProviderKind, ProviderStartOptions } from "@caide/contracts";

export interface TextGenerationProviderInput {
  readonly modelSelection: ModelSelection;
  readonly providerOptions?: ProviderStartOptions;
}

export function hasDedicatedTextGenerationProvider(_provider: ProviderKind | undefined): boolean {
  return false;
}

export function resolveTextGenerationInputForSelection(
  _modelSelection: ModelSelection | undefined,
  _providerOptions: ProviderStartOptions | undefined,
): TextGenerationProviderInput | null {
  return null;
}

export function buildGitTextGenerationCallInput(input: {
  readonly textGenerationModel?: string | undefined;
  readonly textGenerationModelSelection?: ModelSelection | undefined;
  readonly providerOptions?: ProviderStartOptions | undefined;
}): {
  readonly model?: string;
  readonly modelSelection?: ModelSelection;
  readonly providerOptions?: ProviderStartOptions;
} {
  const modelSelection = input.textGenerationModelSelection;
  const model = input.textGenerationModel?.trim() || modelSelection?.model;

  return {
    ...(model ? { model } : {}),
    ...(modelSelection ? { modelSelection } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
  };
}
