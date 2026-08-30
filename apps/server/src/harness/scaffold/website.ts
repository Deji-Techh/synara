/**
 * Scaffold Website — Vite per 004 M21.
 */
import { mkdirSync, writeFileSync } from "node:fs";
export function scaffoldWebsite(root: string): string[] {
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/package.json`, JSON.stringify({ name: "website", scripts: { dev: "vite", build: "vite build" } }, null, 2));
  writeFileSync(`${root}/.caide/framework.json`, JSON.stringify({ framework: "website" }, null, 2));
  return [`${root}/package.json`];
}
