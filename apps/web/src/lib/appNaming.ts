// FILE: appNaming.ts
// Purpose: Shared naming helpers for the dyad-style app-creation flow — slug
// generation for ~/caide-apps/<slug> targets, cute random fallback names, and
// deriving an app name from the user's first prompt on the home landing.
// Layer: Web domain helpers

const CUTE_ADJECTIVES = [
  "wandering",
  "bouncy",
  "dapper",
  "mushy",
  "clumsy",
  "nebulous",
  "flawless",
  "nappy",
  "medical",
  "previous",
] as const;

const CUTE_NOUNS = [
  "koala",
  "fenris",
  "overlord",
  "squirrel",
  "jigsaw",
  "gods",
  "cobra",
  "vulcan",
  "knight",
  "otter",
] as const;

export function toAppSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `app-${Date.now().toString(36)}`
  );
}

export function generateCuteAppName(): string {
  const adjective = CUTE_ADJECTIVES[Math.floor(Math.random() * CUTE_ADJECTIVES.length)]!;
  const noun = CUTE_NOUNS[Math.floor(Math.random() * CUTE_NOUNS.length)]!;
  return `${adjective}-${noun}`;
}

/**
 * Derives an app name from the first prompt typed on the home landing. The
 * branding wizard appends structured blocks to the prompt before this runs, so
 * known branding blocks are stripped first — they must never leak into the
 * derived app name.
 */
export function deriveAppNameFromPrompt(prompt: string): string {
  const withoutBrandingBlocks = prompt
    .split(/\r?\n/)
    .filter((line) => !/^(Branding Setup|App Branding Setup):/.test(line.trim()))
    .join(" ");
  const words = withoutBrandingBlocks.trim().split(/\s+/).slice(0, 4).join(" ");
  const slug = words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || generateCuteAppName();
}

/** Suffixes a candidate name until it stops colliding with an existing app. */
export function withAppNameSuffix(name: string, attempt: number): string {
  if (attempt <= 0) return name;
  return `${name}-${attempt + 1}`;
}
