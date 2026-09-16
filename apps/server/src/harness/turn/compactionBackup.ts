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

/**
 * Transform tool XML tags to shorter, LLM-friendly equivalents and truncate
 * large tool results for token efficiency. Donor verbatim (dyad x caide
 * compaction_storage.ts transformToolTags).
 */
export function transformToolTags(content: string): string {
  // Transform <dyad-mcp-tool-call> to <tool-use>. Tolerates extra attributes
  // (e.g. call-id); expects server before tool, which every emitter does.
  let result = content.replace(
    /<dyad-mcp-tool-call\b[^>]*?\bserver="([^"]*)"[^>]*?\btool="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/dyad-mcp-tool-call>/g,
    '<tool-use name="$2" server="$1">\n$3\n</tool-use>',
  );

  // Transform <dyad-mcp-tool-result> to <tool-result> with truncation
  result = result.replace(
    /<dyad-mcp-tool-result\b[^>]*?\bserver="([^"]*)"[^>]*?\btool="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/dyad-mcp-tool-result>/g,
    (_match, server, tool, resultContent: string) => {
      const chars = resultContent.length;
      const truncated = chars > TOOL_RESULT_TRUNCATION_LIMIT;
      const attrs = [
        `name="${tool}"`,
        `server="${server}"`,
        `chars="${chars}"`,
        ...(truncated ? ['truncated="true"'] : []),
      ].join(" ");
      const body = truncated
        ? resultContent.slice(0, TOOL_RESULT_TRUNCATION_LIMIT) + "\n..."
        : resultContent;
      return `<tool-result ${attrs}>\n${body}\n</tool-result>`;
    },
  );

  return result;
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
    // Same-millisecond bursts (tests, rapid retries) would otherwise share
    // a filename and overwrite each other — disambiguate, keeping the
    // donor `compaction-<ts>.md` shape so the prune filter still matches.
    let name = `compaction-${stamp}.md`;
    let target = path.join(dir, name);
    for (let i = 1; fs.existsSync(target); i++) {
      name = `compaction-${stamp}-${i}.md`;
      target = path.join(dir, name);
    }
    // Donor transcript shape (formatAsTranscript): session + messageCount +
    // per-role messages, tool tags transformed BEFORE truncation so the
    // chars/truncated accounting reflects what the summarizer actually reads.
    const rendered = history.map((m) => ({
      role: m.role,
      text: transformToolTags(messageText(m)),
    }));
    const body = [
      `<transcript session="${sessionId}" messageCount="${rendered.length}" compactedAt="${new Date().toISOString()}">`,
      ...rendered.map((m) => `<msg role="${m.role}">\n${m.text.slice(0, 4000)}\n</msg>`),
      `</transcript>`,
    ].join("\n\n");
    fs.writeFileSync(target, body);
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
    return path.relative(appPath, target);
  } catch {
    return null;
  }
}
