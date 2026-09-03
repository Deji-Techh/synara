// FILE: apiKey.ts
// Purpose: Provider API-key normalize + validate helpers.
// Donor: dyad x caide src/lib/providerApiKey.ts (verbatim).
// Keys must be visible-ASCII only — catches pasted labels/notes early.

export interface InvalidProviderApiKeyCharacter {
  index: number;
  codePoint: number;
}

export function normalizeProviderApiKeyInput(
  value: string | null | undefined,
): string {
  return value?.trim() ?? "";
}

export function findInvalidProviderApiKeyCharacter(
  value: string,
): InvalidProviderApiKeyCharacter | null {
  let index = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x21 || codePoint > 0x7e) {
      return { index, codePoint };
    }
    index += char.length;
  }
  return null;
}

export function formatInvalidProviderApiKeyMessage(
  providerDisplayName: string,
  invalid: InvalidProviderApiKeyCharacter,
): string {
  return `${providerDisplayName} API key contains an invalid character at index ${invalid.index} (U+${invalid.codePoint.toString(16).toUpperCase().padStart(4, "0")}). Paste only the raw API key, without labels, notes, or copied page text.`;
}

export class InvalidProviderApiKeyError extends Error {
  constructor(providerDisplayName: string, value: string) {
    const invalid = findInvalidProviderApiKeyCharacter(value);
    super(
      invalid
        ? formatInvalidProviderApiKeyMessage(providerDisplayName, invalid)
        : `${providerDisplayName} API key is invalid.`,
    );
    this.name = "InvalidProviderApiKeyError";
  }
}

/** Normalize settings/env key input; throws on invalid characters. */
export function resolveApiKeyOrThrow(
  value: string | null | undefined,
  providerDisplayName: string,
): string | undefined {
  const normalized = normalizeProviderApiKeyInput(value);
  if (!normalized) return undefined;
  const invalid = findInvalidProviderApiKeyCharacter(normalized);
  if (invalid) {
    throw new InvalidProviderApiKeyError(providerDisplayName, normalized);
  }
  return normalized;
}
