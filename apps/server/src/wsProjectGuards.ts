// FILE: wsProjectGuards.ts
// Purpose: Enforce projectId-only APIs — reject raw workspaceRoot strings from client.
// Premium security: workspace resolves server-side via ProjectionSnapshotQuery.

import type { ProjectId } from "@caide/contracts";
import { WsRpcError } from "@caide/contracts";

export function assertProjectIdOnly(input: {
  projectId?: string;
  workspaceRoot?: string;
}): ProjectId | never {
  if (input.workspaceRoot !== undefined) {
    throw new WsRpcError({
      message: "workspaceRoot string not allowed — use projectId and server will resolve",
    });
  }
  if (!input.projectId) throw new WsRpcError({ message: "projectId required" });
  return input.projectId as ProjectId;
}
