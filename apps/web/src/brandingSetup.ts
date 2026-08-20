// FILE: brandingSetup.ts
// Purpose: Build the branding context block that gets appended to the first
// message of a brand-new project when the user goes through the App Branding
// wizard (build / agent modes only). Mirrors dyad x caide's BrandingWizardModal
// contract so the Flutter Builder Engine receives a name, colors, and optional
// logo to apply to the generated app.
// Layer: Web composer domain
// Exports: buildBrandingPromptBlock, BrandingData, BrandingColorScheme

export interface BrandingColorScheme {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
}

export interface BrandingData {
  readonly mode: "generate" | "custom";
  readonly name?: string;
  readonly description?: string;
  readonly colors?: BrandingColorScheme;
  /** Present only for custom branding with a chosen logo image file. */
  readonly logoFile?: File | null;
}

const GENERATE_BRANDING_BLOCK =
  "Branding Setup: Please generate a name and a logo for this app, and select a modern color scheme.";

export function buildBrandingPromptBlock(data: BrandingData): string {
  if (data.mode === "generate") {
    return GENERATE_BRANDING_BLOCK;
  }
  const nameLine = data.name?.trim() ? data.name.trim() : "N/A";
  const descriptionLine = data.description?.trim() ? data.description.trim() : "N/A";
  const primary = data.colors?.primary ?? "#NA";
  const secondary = data.colors?.secondary ?? "#NA";
  const accent = data.colors?.accent ?? "#NA";
  return [
    "App Branding Setup:",
    `- Name: ${nameLine}`,
    `- Description: ${descriptionLine}`,
    `- Colors: Primary (${primary}), Secondary (${secondary}), Accent (${accent}).`,
    "Please use these colors in the UI and the attached image as the logo.",
  ].join("\n");
}
