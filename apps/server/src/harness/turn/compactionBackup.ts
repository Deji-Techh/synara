// FILE: compactionBackup.ts
// Purpose: Pre-compaction backup transcript (donor parity): the full text
// being summarized is written under <app>/.dyad/chats/<session>/,
// gitignored, keep-last-5. The durable summary row carries future turns;
// the backup is the audit trail when a summary loses something.

import * as fs from "node:fs";
import * as path from "node:path";

const BACKUP_KEEP_COUNT = 5;
const TOOL_RESULT_TRUNCATION_LIMIT = 1000;

interface HistoryMessage {
  role: string;
  content: unknown;
}

function messageText(message: HistoryMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") return b.text;
        if (b.type === "tool_use") return `[tool ${(b.name as string) ?? "?"}]`;
        if (b.type === "tool_result") {
          const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          return `[result] ${text.slice(0, TOOL_RESULT_TRUNCATION_LIMIT)}`;
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

/** Write the backup transcript; returns the relative path, or null. Never throws. */
export async function writeCompactionBackup(
  sessionId: string,
  appPath: string | undefined,
  history: HistoryMessage[],
): Promise<string | null> {
  try {
    if (!appPath) return null;
    const dir = path.join(appPath, ".dyad", "chats", sessionId);
    fs.mkdirSync(dir, { recursive: true });
    // Keep .dyad out of git like donor ensureDyadGitignored.
    const gitignore = path.join(appPath, ".gitignore");
    try {
      const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
      if (!/(^|\n)\.dyad\/?(\n|$)/.test(current)) {
        fs.writeFileSync(
          gitignore,
          `${current.endsWith("\n") || current.length === 0 ? current : `${current}\n`}.dyad/\n`,
        );
      }
    } catch {
      // gitignore is best-effort
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `compaction-${stamp}.md`;
    const body = [
      `<transcript session="${sessionId}" compactedAt="${new Date().toISOString()}">`,
      ...history.map(
        (m, i) => `<msg index="${i}" role="${m.role}">\n${messageText(m).slice(0, 4000)}\n</msg>`,
      ),
      `</transcript>`,
    ].join("\n\n");
    fs.writeFileSync(path.join(dir, name), body);
    // Retention: keep newest N backups.
    const kept = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("compaction-") && f.endsWith(".md"))
      .sort()
      .slice(-BACKUP_KEEP_COUNT);
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith("compaction-") && f.endsWith(".md") && !kept.includes(f)) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch {
          // prune best-effort
        }
      }
    }
    return path.relative(appPath, path.join(dir, name));
  } catch {
    return null;
  }
}
