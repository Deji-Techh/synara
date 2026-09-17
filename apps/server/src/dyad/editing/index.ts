// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant file-editing engine.

export { normalizeString } from "./textNormalization.ts";
export { parseSearchReplaceBlocks, type SearchReplaceBlock } from "./searchReplaceParser.ts";
export { escapeSearchReplaceMarkers } from "./markers.ts";
export { applySearchReplace } from "./searchReplaceProcessor.ts";
export { safeJoinAppPath, UnsafePathError } from "./safePath.ts";
export {
  applyBuildResponseTags,
  dryRunSearchReplaceTags,
  normalizeTestPath,
  type BuildPipelineError,
  type BuildPipelineResult,
  type BuildTagIssue,
} from "./buildPipeline.ts";
export {
  buildProposalPayload,
  getProposalTransport,
  requestBuildProposalApproval,
  setProposalTransport,
  type BuildProposal,
  type ProposalDecision,
  type ProposalFileChange,
  type ProposalTransport,
} from "./proposal.ts";
export {
  ALL_FILE_EDIT_TOOLS,
  searchReplaceTool,
  multiReplaceTool,
  copyFileTool,
  deleteFileTool,
  renameFileTool,
  executeSearchReplace,
  executeMultiReplace,
  executeCopyFile,
  executeDeleteFile,
  executeRenameFile,
  FileEditValidationError,
} from "./fileEditTools.ts";
