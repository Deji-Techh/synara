// FILE: memory.ts
// Purpose: Project-scoped compounding memory (APP_MEMORY.md + recent
// decisions). Read every turn into the system prompt; written explicitly
// via the remember tool (model agency, no background cost) and implicitly
// via log_decision (already persisted to decisions.jsonl). Scoped to the
// app directory — never shared across projects.

import * as fs from "node:fs";
import * as path from "node:path";

export interface MemoryNote {
  kind: "standing" | "decision";
  text: string;
  time: number;
}

const MEMORY_FILE = "APP_MEMORY.md";
const MAX_PROMPT_CHARS = 2000;
const MAX_DECISIONS = 10;

const TEMPLATE = `# App Memory

Lasting rules, decisions, and gotchas for this project. The agent reads
this every turn and updates it via the remember tool.

## Standing notes
<!-- one lasting rule per line, prefixed with - -->

## Gotchas
<!-- things that broke before, prefixed with - -->
`;

function memoryFile(appPath: string): string {
  return path.join(appPath, ".caide", MEMORY_FILE);
}

/** Parse `- ` bullets under ## sections. */
export function parseMemoryMarkdown(text: string): Array<{ section: string; text: string }> {
  const out: Array<{ section: string; text: string }> = [];
  let section = "";
  for (const line of text.split("\n")) {
    const heading = line.match(/^##\s+(.+)\s*$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const bullet = line.match(/^\s*-\s+(.+)\s*$/);
    if (bullet && section && !line.includes("<!--")) {
      out.push({ section, text: bullet[1].trim() });
    }
  }
  return out;
}

function readDecisions(appPath: string, limit = MAX_DECISIONS): MemoryNote[] {
  try {
    const lines = fs
      .readFileSync(path.join(appPath, ".caide", "decisions.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    return lines.slice(-limit).flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as { decision?: unknown; reason?: unknown; time?: unknown };
        if (typeof parsed.decision !== "string" || !parsed.decision) return [];
        const reason =
          typeof parsed.reason === "string" && parsed.reason ? ` (${parsed.reason})` : "";
        return [
          {
            kind: "decision" as const,
            text: `${parsed.decision}${reason}`,
            time: typeof parsed.time === "number" ? parsed.time : 0,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Read all memory notes for prompt injection (bounded, newest last). */
export function readAppMemory(appPath: string): MemoryNote[] {
  const notes: MemoryNote[] = [];
  try {
    const text = fs.readFileSync(memoryFile(appPath), "utf-8");
    for (const entry of parseMemoryMarkdown(text)) {
      notes.push({ kind: "standing", text: `[${entry.section}] ${entry.text}`, time: 0 });
    }
  } catch {
    // no memory file yet
  }
  notes.push(...readDecisions(appPath));
  return notes;
}

/** Append a standing note (creates the file from template on first use). */
export async function appendMemoryNote(
  appPath: string,
  section: "Standing notes" | "Gotchas",
  text: string,
): Promise<void> {
  const file = memoryFile(appPath);
  await fs.promises.mkdir(path.join(appPath, ".caide"), { recursive: true });
  let content: string;
  try {
    content = await fs.promises.readFile(file, "utf-8");
  } catch {
    content = TEMPLATE;
  }
  const clean = text.trim().slice(0, 500).replace(/\n/g, " ");
  if (!clean) throw new Error("Empty memory note.");
  const marker = `## ${section}`;
  if (!content.includes(marker)) {
    content = `${content.trim()}\n\n${marker}\n`;
  }
  content = content.replace(marker, `${marker}\n- ${clean}`);
  await fs.promises.writeFile(file, content);
}

/** Format notes as a prompt block (empty string when nothing remembered). */
export function formatMemoryForPrompt(notes: MemoryNote[]): string {
  if (notes.length === 0) return "";
  const lines = notes.map((n) => `- ${n.text}`);
  let body = lines.join("\n");
  if (body.length > MAX_PROMPT_CHARS) {
    body = `...[${notes.length} notes, showing recent]\n${body.slice(-MAX_PROMPT_CHARS)}`;
  }
  return `<app_memory>\nLasting project memory (still binding unless the user revoked it):\n${body}\n</app_memory>`;
}
