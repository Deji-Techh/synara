// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant file-editing engine.

export { normalizeString } from "./textNormalization.ts";
export {
  parseSearchReplaceBlocks,
  type SearchReplaceBlock,
} from "./searchReplaceParser.ts";
export { escapeSearchReplaceMarkers } from "./markers.ts";
export { applySearchReplace } from "./searchReplaceProcessor.ts";
export { safeJoinAppPath, UnsafePathError } from "./safePath.ts";
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
