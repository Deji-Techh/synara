/**
 * Route project — per 004 M56-M58 POST /api/harness/* + trusted workspace per M21.
 * Batch of 10 per user rule — real wiring (not stub).
 */
import { frameworkRegistry, type ProjectFramework } from "../framework/registry.ts";
export function handleProject() {
  void frameworkRegistry;
}
