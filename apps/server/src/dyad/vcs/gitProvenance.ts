// FILE: gitProvenance.ts
// Purpose: Per-turn git provenance for `<system-reminder>` commit notices.
// Records the repo HEAD before each turn and, at turn end, whether the turn
// produced a commit. The next turn's user message carries the reminder so
// the model can use commit hashes with git inspection tools. Donor pattern:
// local_agent_handler.ts buildGitReminder + history commitHash/
// sourceCommitHash plumbing (drizzle message columns replaced by a session
// map; non-repos simply yield no provenance).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TurnProvenance {
  /** HEAD before the turn (app state at turn start). */
  sourceCommitHash?: string;
  /** Commit created by the turn, when the tree changed. */
  commitHash?: string;
}

const lastTurn = new Map<string, TurnProvenance>();

async function headCommit(appPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: appPath,
      timeout: 10_000,
    });
    const hash = stdout.trim();
    return /^[0-9a-f]{40}$/i.test(hash) ? hash : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Capture turn-start provenance. Returns the PREVIOUS turn's record for
 * this turn's reminder, then records the new turn-start HEAD (overwriting
 * is safe — the previous record was just returned to the caller).
 */
export async function captureTurnStart(
  sessionId: string,
  appPath: string,
): Promise<TurnProvenance | undefined> {
  const previous = lastTurn.get(sessionId);
  const sourceCommitHash = await headCommit(appPath);
  lastTurn.set(sessionId, sourceCommitHash ? { sourceCommitHash } : {});
  return previous;
}

/**
 * Capture turn-end provenance: when HEAD moved, the turn created a commit.
 * Returns the updated record (also stored for the next turn's reminder).
 */
export async function captureTurnEnd(sessionId: string, appPath: string): Promise<TurnProvenance> {
  const record = lastTurn.get(sessionId) ?? {};
  const now = await headCommit(appPath);
  if (now && now !== record.sourceCommitHash) {
    record.commitHash = now;
  } else {
    delete record.commitHash;
  }
  lastTurn.set(sessionId, record);
  return record;
}

/** Provenance available for the NEXT turn's reminder (prior turn's record). */
export function getTurnProvenance(sessionId: string): TurnProvenance | undefined {
  return lastTurn.get(sessionId);
}

/** True when the app is a git repo (drives the gitProvenance prompt flag). */
export async function isGitRepo(appPath: string): Promise<boolean> {
  return (await headCommit(appPath)) !== undefined;
}

/** Test-only: clear provenance records. */
export function clearTurnProvenance(sessionId?: string): void {
  if (sessionId) lastTurn.delete(sessionId);
  else lastTurn.clear();
}
