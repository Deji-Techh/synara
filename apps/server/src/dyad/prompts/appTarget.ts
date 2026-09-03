// FILE: appTarget.ts
// Purpose: Build-target type shared by Dyad-transplant prompt builders.
// Donor: dyad x caide src/lib/schemas.ts AppTargetSchema (mobile|web).
// Kept local to avoid the donor "@/lib/schemas" Electron alias.

export type AppTarget = "mobile" | "web";

export function normalizeAppTarget(value: unknown): AppTarget {
  return value === "web" ? "web" : "mobile";
}
