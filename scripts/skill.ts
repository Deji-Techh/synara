#!/usr/bin/env bun
// Usage: bun run skill:new --name <kebab-case> --desc "short description"
// Creates apps/server/src/agentGateway/prompts/skills/<name>/SKILL.md from _template

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
function getArg(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

const name = getArg("--name") ?? getArg("-n");
if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
  console.error("Usage: bun run skill:new --name <kebab-case> [--desc \"...\"]");
  console.error("  name must be kebab-case, e.g. edge-long-text, motion-timing");
  process.exit(1);
}
const desc = getArg("--desc") ?? `Atomic skill for ${name}`;

const root = join(import.meta.dir, "..");
const templatePath = join(root, "apps/server/src/agentGateway/prompts/skills/_template/SKILL.md");
const destDir = join(root, "apps/server/src/agentGateway/prompts/skills", name);
const destPath = join(destDir, "SKILL.md");

if (existsSync(destPath)) {
  console.error(`Skill already exists: ${destPath}`);
  process.exit(1);
}

let template = "";
try {
  template = readFileSync(templatePath, "utf8");
} catch {
  console.error(`Template not found: ${templatePath}`);
  process.exit(1);
}

const now = new Date().toISOString().slice(0, 10);
const content = template
  .replace("name: template-skill", `name: ${name}`)
  .replace(/description: .*/, `description: ${JSON.stringify(desc).slice(1, -1) ? desc : desc}`)
  .replace("# Template Skill — Replace This Heading", `# ${name.split("-").map(s => s[0]!.toUpperCase()+s.slice(1)).join(" ")}`);

mkdirSync(destDir, { recursive: true });
writeFileSync(destPath, content, "utf8");
console.log(`Created ${destPath}`);
console.log(`Next: edit frontmatter (when_to_use, allowed_tools, context) and body, then commit.`);
