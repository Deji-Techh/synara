// harness/global.ts — M25 global concerns: RTL/localization + team permissions + legal license
// These are perfect-gate rails, not v1 blockers, but must be generation-aware not questionnaire-only

export type Locale = string; // e.g. "en", "ar", "he" (RTL)

export function isRtlLocale(locale: Locale): boolean {
  return ["ar", "he", "fa", "ur"].includes(locale.split("-")[0]!.toLowerCase());
}

// Text expansion factor for layout safety (e.g. German ~1.3× English)
export function expansionFactor(locale: Locale): number {
  const rtl = isRtlLocale(locale);
  if (rtl) return 1.25;
  if (locale.startsWith("de") || locale.startsWith("fr")) return 1.3;
  if (locale.startsWith("ja") || locale.startsWith("zh")) return 0.9;
  return 1.15;
}

// Mirroring: entire layout flips for RTL, not just text
export function shouldMirrorLayout(locale: Locale): boolean {
  return isRtlLocale(locale);
}

// Team permissions — lightweight gate before building enterprise
export type TeamRole = "owner" | "admin" | "member" | "viewer";
export interface TeamMember { readonly id: string; readonly role: TeamRole; }

export function canApprove(member: TeamMember): boolean {
  return member.role === "owner" || member.role === "admin";
}

export function auditTrail(entry: { actor: string; action: string; at: string; target: string }): string {
  return `${entry.at} ${entry.actor} ${entry.action} ${entry.target}`;
}

// Legal — license compatibility, not just security (M25)
// Placeholder: real check fans out to `npm view <pkg> license` + SPDX allow-list
export const ALLOWED_LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"] as const;

export function isLicenseAllowed(spdx: string): boolean {
  return (ALLOWED_LICENSES as readonly string[]).includes(spdx);
}
