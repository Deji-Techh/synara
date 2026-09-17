// FILE: proposal.ts
// Purpose: Build-proposal approve/reject (008-m9b2, V1 code-proposal parity).
// The build text turn parks the turn on this card instead of applying tags
// when the turn did not opt into autoApproveChanges. Answers ride the
// generic prompt_answer transport ({approved:"true"/"false"}, checkpoint
// precedent); dismiss/timeout/abort discard the proposal (V1: unapproved
// proposals apply nothing).
// Donor: dyad x caide proposal_handlers.ts get-proposal (payload shape).

import {
  getCaideCopyTags,
  getCaideDeleteTags,
  getCaideGenerateTestTags,
  getCaideRenameTags,
  getCaideSearchReplaceTags,
  getCaideWriteTags,
} from "../../harness/utils/caideTagParser.ts";
import { consumeTimedOut, nextRequestId, waitForUserInput } from "../plan/userPrompt.ts";
import { normalizeTestPath } from "./buildPipeline.ts";

export interface ProposalFileChange {
  name: string;
  path: string;
  summary: string;
  type: "write" | "rename" | "delete" | "copy" | "test";
}

export interface BuildProposal {
  title: string;
  filesChanged: ProposalFileChange[];
}

function basename(relPath: string): string {
  const parts = relPath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? relPath;
}

function chatSummary(fullText: string): string | null {
  const match = /<dyad-chat-summary>(.*?)<\/dyad-chat-summary>/s.exec(fullText);
  const title = match?.[1]?.trim();
  return title ? title : null;
}

/**
 * Assemble the proposal payload from a build response (donor get-proposal
 * filesChanged shape; copy/test rows are additive — V1 predates copy tags).
 * Returns null when the response carries no file tags (nothing to approve).
 */
export function buildProposalPayload(fullText: string): BuildProposal | null {
  const filesChanged: ProposalFileChange[] = [];
  for (const tag of [...getCaideWriteTags(fullText), ...getCaideSearchReplaceTags(fullText)]) {
    filesChanged.push({
      name: basename(tag.path),
      path: tag.path,
      summary: tag.description ?? "(no change summary found)",
      type: "write",
    });
  }
  for (const tag of getCaideRenameTags(fullText)) {
    filesChanged.push({
      name: basename(tag.to),
      path: tag.to,
      summary: `Rename from ${tag.from} to ${tag.to}`,
      type: "rename",
    });
  }
  for (const filePath of getCaideDeleteTags(fullText)) {
    filesChanged.push({
      name: basename(filePath),
      path: filePath,
      summary: "Delete file",
      type: "delete",
    });
  }
  for (const tag of getCaideCopyTags(fullText)) {
    filesChanged.push({
      name: basename(tag.to),
      path: tag.to,
      summary: `Copy from ${tag.from} to ${tag.to}`,
      type: "copy",
    });
  }
  for (const tag of getCaideGenerateTestTags(fullText)) {
    const filePath = normalizeTestPath(tag.path);
    filesChanged.push({
      name: basename(filePath),
      path: filePath,
      summary: tag.description ?? "(no change summary found)",
      type: "test",
    });
  }
  if (filesChanged.length === 0) return null;
  return { title: chatSummary(fullText) ?? "Proposed File Changes", filesChanged };
}

export interface ProposalTransport {
  sendProposal(sessionId: string, requestId: string, proposal: BuildProposal): void;
  sendPromptWithdraw(sessionId: string, requestId: string): void;
}

let proposalTransport: ProposalTransport | null = null;
/** WS layer wires this (uiBridge); without one proposals dismiss immediately. */
export function setProposalTransport(transport: ProposalTransport | null): void {
  proposalTransport = transport;
}
export function getProposalTransport(): ProposalTransport | null {
  return proposalTransport;
}

export type ProposalDecision = "approved" | "rejected" | "dismissed" | "timed-out" | "empty";

/**
 * Park the turn on a proposal card and await the verdict. Never parks when
 * nobody can answer (no transport) or when the response has no file tags —
 * both settle immediately so headless turns can't wedge. Timeout/abort/
 * dismiss all discard (V1: unapproved proposals apply nothing); the caller
 * withdraws the card on every null settlement.
 */
export async function requestBuildProposalApproval(input: {
  sessionId: string;
  fullText: string;
  signal?: AbortSignal;
  /** Test seam: deadline override (production default is the kind deadline). */
  timeoutMs?: number;
}): Promise<{ decision: ProposalDecision; requestId: string | null }> {
  const proposal = buildProposalPayload(input.fullText);
  if (!proposal) return { decision: "empty", requestId: null };
  const transport = getProposalTransport();
  if (!transport) return { decision: "dismissed", requestId: null };
  const requestId = nextRequestId("proposal");
  transport.sendProposal(input.sessionId, requestId, proposal);
  const answers = await waitForUserInput(
    requestId,
    input.sessionId,
    "proposal",
    input.signal,
    input.timeoutMs,
  );
  if (answers === null) {
    transport.sendPromptWithdraw(input.sessionId, requestId);
    return {
      decision: consumeTimedOut(requestId) ? "timed-out" : "dismissed",
      requestId,
    };
  }
  return { decision: answers["approved"] === "true" ? "approved" : "rejected", requestId };
}
