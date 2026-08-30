/**
 * Preview/build routing M21 — Blank→none, RN/Website→browser, RN+Flutter→device frame.
 * Trusted workspace enforced per 004 M21.
 */
import { frameworkRegistry, type ProjectFramework } from "../framework/registry.ts";

export function previewFor(framework: ProjectFramework): string {
  return frameworkRegistry[framework].preview;
}

export function buildCommandsFor(framework: ProjectFramework): string[] {
  return frameworkRegistry[framework].build;
}
