/**
 * ProviderIcon - shared provider glyphs for chat, sidebar, and picker surfaces.
 *
 * Centralizes provider-to-icon mapping so new providers do not need repeated
 * branching across every UI surface.
 */
import { type ProviderKind } from "@caide/contracts";
import type { ReactNode, SVGProps } from "react";

import { FlaskConicalIcon, GlobeIcon, HammerIcon, TerminalSquareIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { ClaudeAI, OpenAI, type Icon } from "./Icons";

export type ProviderIconTone = "default" | "header";

export const PROVIDER_ICON_COMPONENT_BY_PROVIDER: Record<ProviderKind, Icon> = {
  engine: HammerIcon,
  openai: OpenAI,
  anthropic: ClaudeAI,
  google: FlaskConicalIcon,
  openrouter: GlobeIcon,
  ollama: TerminalSquareIcon,
  deepseek: GlobeIcon,
  groq: GlobeIcon,
  mistral: GlobeIcon,
  together: GlobeIcon,
  cohere: GlobeIcon,
  xai: GlobeIcon,
  fireworks: GlobeIcon,
  opencodeZen: GlobeIcon,
  opencodeGo: GlobeIcon,
};

export function providerIconToneClassName(
  _provider: ProviderKind | null | undefined,
  _tone: ProviderIconTone = "default",
): string {
  return "text-foreground";
}

export type ProviderIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  readonly provider: ProviderKind | null | undefined;
  readonly fallback?: ReactNode;
  readonly tone?: ProviderIconTone;
};

export function ProviderIcon({
  provider,
  fallback: fallbackProp,
  tone: toneProp,
  className,
  "aria-hidden": ariaHiddenProp,
  ...svgProps
}: ProviderIconProps) {
  const fallback = fallbackProp ?? null;
  const tone = toneProp ?? "default";
  const ariaHidden = ariaHiddenProp ?? true;
  if (provider === null || provider === undefined) {
    return fallback;
  }

  const Icon = PROVIDER_ICON_COMPONENT_BY_PROVIDER[provider];
  return (
    <Icon
      aria-hidden={ariaHidden}
      {...svgProps}
      className={cn(providerIconToneClassName(provider, tone), className)}
    />
  );
}

export function ProviderOptionLabel({
  provider,
  label,
  className,
  iconClassName,
}: {
  provider: ProviderKind;
  label: ReactNode;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <ProviderIcon provider={provider} className={cn("size-3.5", iconClassName)} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
