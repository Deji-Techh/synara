// harness/global.ts — M25 global concerns: RTL/localization + team permissions + legal license
// These are perfect-gate rails, not v1 blockers, but must be generation-aware not questionnaire-only

export type Locale = string;

export function isRtlLocale(locale: Locale): boolean {
  return ["ar", "he", "fa", "ur"].includes(locale.split("-")[0]!.toLowerCase());
}

export function expansionFactor(locale: Locale): number {
  const rtl = isRtlLocale(locale);
  if (rtl) return 1.25;
  if (locale.startsWith("de") || locale.startsWith("fr")) return 1.3;
  if (locale.startsWith("ja") || locale.startsWith("zh")) return 0.9;
  return 1.15;
}

export function shouldMirrorLayout(locale: Locale): boolean {
  return isRtlLocale(locale);
}

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export interface TeamMember { readonly id: string; readonly role: TeamRole; }

export function canApprove(member: TeamMember): boolean {
  return member.role === "owner" || member.role === "admin";
}

export function auditTrail(entry: { actor: string; action: string; at: string; target: string }): string {
  return `${entry.at} ${entry.actor} ${entry.action} ${entry.target}`;
}

export const ALLOWED_LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"] as const;

export function isLicenseAllowed(spdx: string): boolean {
  return (ALLOWED_LICENSES as readonly string[]).includes(spdx);
}

// M25: Apply RTL mirror to generated code
export function applyRtlMirror(code: string, locale: Locale): string {
  if (!shouldMirrorLayout(locale)) return code;
  // Add RTL support to StyleSheet
  return code.replace(
    /StyleSheet\.create\(\{/,
    `StyleSheet.create({\n  container: { direction: 'rtl' },`,
  );
}

// M25: Apply text expansion to layout constraints
export function applyTextExpansion(code: string, locale: Locale): string {
  const factor = expansionFactor(locale);
  if (factor === 1.15) return code; // default, no change
  // Widen fixed-width containers by expansion factor
  return code.replace(/width:\s*(\d+)/g, (_, w) => `width: ${Math.round(Number(w) * factor)}`);
}
