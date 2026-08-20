// FILE: providerMetadata.ts
// Purpose: Exhaustive non-secret provider identity and presentation metadata.

import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@caide/contracts";

export interface ProviderDescriptor {
  readonly kind: ProviderKind;
  readonly displayName: string;
  readonly available: boolean;
  /**
   * True when the provider runtime can inject a user message into a live turn
   * without interrupting it (Codex `turn/steer`, Pi `session.steer`, Claude
   * streaming-input prompt queue). Mirrors the adapter's
   * `supportsTurnSteering` capability so the pure decider and the web client
   * can route steers without a runtime round-trip; keep the two in sync.
   */
  readonly supportsNativeTurnSteering: boolean;
  readonly usage: {
    readonly signInCommand: string;
    readonly learnMoreHref: string;
  } | null;
}

export const PROVIDER_DESCRIPTORS = [
  {
    kind: "engine",
    displayName: PROVIDER_DISPLAY_NAMES.engine,
    available: true,
    supportsNativeTurnSteering: true,
    usage: null,
  },
  {
    kind: "openai",
    displayName: PROVIDER_DISPLAY_NAMES.openai,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "anthropic",
    displayName: PROVIDER_DISPLAY_NAMES.anthropic,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "google",
    displayName: PROVIDER_DISPLAY_NAMES.google,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "openrouter",
    displayName: PROVIDER_DISPLAY_NAMES.openrouter,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "ollama",
    displayName: PROVIDER_DISPLAY_NAMES.ollama,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "deepseek",
    displayName: PROVIDER_DISPLAY_NAMES.deepseek,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "groq",
    displayName: PROVIDER_DISPLAY_NAMES.groq,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "mistral",
    displayName: PROVIDER_DISPLAY_NAMES.mistral,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "together",
    displayName: PROVIDER_DISPLAY_NAMES.together,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "cohere",
    displayName: PROVIDER_DISPLAY_NAMES.cohere,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "xai",
    displayName: PROVIDER_DISPLAY_NAMES.xai,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "fireworks",
    displayName: PROVIDER_DISPLAY_NAMES.fireworks,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "opencodeZen",
    displayName: PROVIDER_DISPLAY_NAMES.opencodeZen,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
  {
    kind: "opencodeGo",
    displayName: PROVIDER_DISPLAY_NAMES.opencodeGo,
    available: true,
    supportsNativeTurnSteering: false,
    usage: null,
  },
] as const satisfies readonly ProviderDescriptor[];

export const PROVIDER_DESCRIPTOR_BY_KIND = Object.fromEntries(
  PROVIDER_DESCRIPTORS.map((descriptor) => [descriptor.kind, descriptor]),
) as Record<ProviderKind, (typeof PROVIDER_DESCRIPTORS)[number]>;

// Accepts plain strings so projection-sourced provider names can be checked
// without casts; unknown providers are simply not steerable.
export const providerSupportsNativeTurnSteering = (kind: string): boolean =>
  PROVIDER_DESCRIPTORS.some(
    (descriptor) => descriptor.kind === kind && descriptor.supportsNativeTurnSteering,
  );
