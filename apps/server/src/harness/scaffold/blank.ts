/**
 * Scaffold blank — empty project, no preview per 004 M21.
 */
import { mkdirSync, writeFileSync } from "node:fs";
export function scaffoldBlank(root: string): string[] {
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/README.md`, `# Blank project\nImmutable framework blank per 004 M2\n`);
  writeFileSync(`${root}/.caide/framework.json`, JSON.stringify({ framework: "blank" }, null, 2));
  return [`${root}/README.md`, `${root}/.caide/framework.json`];
}
