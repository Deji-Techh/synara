// FILE: securityFindings.ts
// Purpose: Security-finding extraction from agent transcripts (Security
// pane backend).
// Donor: dyad x caide src/ipc/handlers/security_handlers.ts — the
// `<dyad-security-finding title level>` tag contract wins (007 §6.14) and
// the parser regex is verbatim. Retrieval adapted: V1 queried SQLite
// messages; V2 scans the thread's harness event log (token text).

import { readHarnessEvents } from "../../harness/turn/eventLog.ts";

export interface SecurityFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

/**
 * Donor parseSecurityFindings parity: lazy quantifier with proper
 * boundaries to prevent catastrophic backtracking.
 */
export function parseSecurityFindings(content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const regex =
    /<dyad-security-finding\s+title="([^"]+)"\s+level="(critical|high|medium|low)">([\s\S]*?)<\/dyad-security-finding>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [, title, level, description] = match;
    if (!title || !level || description === undefined) continue;
    findings.push({
      title: title.trim(),
      level: level as SecurityFinding["level"],
      description: description.trim(),
    });
  }
  return findings;
}

export interface LatestSecurityReview {
  findings: SecurityFinding[];
  /** Epoch ms of the log read (event log entries carry no timestamps). */
  checkedAt: number;
}

/**
 * Donor getLatestSecurityReview parity: latest assistant text carrying
 * findings wins. Returns null when the thread has no security review yet
 * (the pane renders its empty state; Phase 6/017 owns the surface).
 */
export async function getLatestSecurityReview(
  threadId: string,
): Promise<LatestSecurityReview | null> {
  const events = await readHarnessEvents(threadId);
  let transcript = "";
  for (const event of events) {
    if (event.type === "token" && typeof (event as { content?: unknown }).content === "string") {
      transcript += (event as { content: string }).content;
    }
  }
  const findings = parseSecurityFindings(transcript);
  if (findings.length === 0) return null;
  return { findings, checkedAt: Date.now() };
}
