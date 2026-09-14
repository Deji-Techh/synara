// FILE: chatHistoryFiles.ts
// Purpose: Shared session-log file access for chat history (scan + FTS).
// Single direction: chatHistoryTools.ts and chatSearchIndex.ts both import
// from here (no mutual imports).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const MAX_SESSIONS_SCANNED = 50;
export const MAX_EXCERPT_CHARS = 600;
export const MAX_READ_CHARS = 12_000;

function sessionsDir(): string {
  const override = process.env.CAIDE_SESSIONS_DIR?.trim();
  if (override) return override;
  return path.join(os.homedir(), ".caide", "sessions");
}

/** Session ids with logs on disk (test seam via CAIDE_SESSIONS_DIR). */
export function listSessionIds(excludeSessionId: string): string[] {
  const dir = sessionsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return (
    files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.slice(0, -".jsonl".length))
      .filter((id) => id !== excludeSessionId)
      // Dev/test artifacts (probes, smoke runs, scratch sessions) pollute
      // recall with garbage — real threads use UUID ids. Never candidates,
      // still directly readable via read_chat when explicitly named.
      .filter((id) => !/^(s-|probe|test|smoke|session-)/i.test(id))
      .sort()
      .slice(-MAX_SESSIONS_SCANNED)
  );
}

export interface LogLine {
  seq: number;
  kind: "user" | "assistant" | "tool";
  text: string;
}

function eventText(data: any): string {
  if (!data || typeof data !== "object") return "";
  switch (data.type) {
    case "token":
      return typeof data.content === "string" ? data.content : "";
    case "turn_start":
      return typeof data.prompt === "string" ? data.prompt : "";
    case "steer":
      return typeof data.prompt === "string" ? `[follow-up] ${data.prompt}` : "";
    case "tool_call": {
      // Recall needs WHAT the tool did and WHAT came back — name+status
      // alone makes answers and decisions invisible to later turns.
      const name = data.name ?? "?";
      const status = data.status ?? "";
      if (status === "completed" || status === "failed") {
        const result =
          typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? "");
        return `[tool ${name} ${status}: ${result.slice(0, 300)}]`.trim();
      }
      return `[tool ${name} ${status}]`.trim();
    }
    case "ui_prompt": {
      const questions = (data.payload as { questions?: Array<{ question?: string }> })?.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        return `[questions asked: ${questions
          .map((q) => q.question ?? "")
          .join(" | ")
          .slice(0, 300)}]`;
      }
      return `[prompt ${data.kind ?? "?"}]`;
    }
    case "stage":
      return "";
    case "error":
      return typeof data.message === "string" ? `[error ${data.message}]` : "";
    default:
      return "";
  }
}

/** Reconstruct readable lines from a session log file. */
export function readSessionLines(sessionId: string): LogLine[] {
  const filePath = path.join(sessionsDir(), `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const lines: LogLine[] = [];
  let tokenBuffer = "";
  let tokenSeq = 0;
  const flushTokens = () => {
    if (tokenBuffer.trim()) {
      lines.push({ seq: tokenSeq, kind: "assistant", text: tokenBuffer });
    }
    tokenBuffer = "";
  };
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const seq = typeof entry.seq === "number" ? entry.seq : 0;
    if (entry.type === "harness/event") {
      const text = eventText(entry.data);
      if (entry.data?.type === "token") {
        tokenSeq = seq;
        tokenBuffer += text;
      } else {
        flushTokens();
        if (text) {
          const kind =
            entry.data?.type === "tool_call"
              ? "tool"
              : entry.data?.type === "turn_start" || entry.data?.type === "steer"
                ? "user"
                : "assistant";
          lines.push({ seq, kind, text });
        }
      }
    } else if (entry.type === "user/message") {
      flushTokens();
      const content =
        typeof entry.data === "string"
          ? entry.data
          : typeof entry.data?.content === "string"
            ? entry.data.content
            : JSON.stringify(entry.data ?? "");
      lines.push({ seq, kind: "user", text: String(content).slice(0, MAX_EXCERPT_CHARS) });
    } else if (entry.type === "assistant/message") {
      flushTokens();
      const content =
        typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data ?? "");
      lines.push({ seq, kind: "assistant", text: String(content).slice(0, MAX_EXCERPT_CHARS) });
    }
  }
  flushTokens();
  return lines.filter((l) => l.text.trim().length > 0);
}

export function keywordsOf(text: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "what",
    "did",
    "we",
    "you",
    "have",
    "has",
    "had",
    "was",
    "were",
    "is",
    "are",
    "it",
    "this",
    "that",
    "about",
    "our",
    "us",
    "i",
    "my",
    "me",
    "do",
    "does",
    "any",
    "had",
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length > 2 && !stop.has(w));
}

export function scoreLine(line: LogLine, keywords: string[]): number {
  const lower = line.text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += kw.length > 5 ? 2 : 1;
  }
  return score;
}
