/**
 * Human gates — CheckpointCard Approve/Request change/View diff.
 * Per 004 M13 after design + after first slice hard checkpoints.
 */
export type Checkpoint = {
  id: string;
  reason: string;
  confidence: number;
  diffSummary: string;
  requiresResponse: boolean;
};
export type CheckpointDecision = "approve" | "request_change" | "view_diff";

export function createCheckpoint(
  reason: string,
  confidence: number,
  diffSummary: string,
): Checkpoint {
  return {
    id: `chk-${Date.now()}`,
    reason,
    confidence,
    diffSummary,
    requiresResponse: confidence < 0.6,
  };
}

export function shouldAutoApprove(checkpoint: Checkpoint): boolean {
  return checkpoint.confidence >= 0.85;
}
