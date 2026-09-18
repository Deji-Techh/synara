// FILE: index.ts
// Purpose: Verify-loop agent tools (design audit, type checks, problems,
// security findings).

export {
  auditDesignWorkspace,
  verifyDesignTool,
  ALL_VERIFY_TOOLS,
  type DesignFinding,
} from "./designAudit.ts";
export { runTypeChecksTool, ALL_TYPECHECK_TOOLS } from "./typecheckTool.ts";
export {
  generateProblemReport,
  getTypeCheckPreconditionGuidance,
  getTypeCheckPreconditionKind,
  resolveTsconfig,
  parseTscOutput,
  TypeCheckPreconditionError,
  type CodeProblem,
  type ProblemReport,
  type TypeCheckPreconditionKind,
} from "./problems.ts";
export {
  parseSecurityFindings,
  getLatestSecurityReview,
  type SecurityFinding,
  type LatestSecurityReview,
} from "./securityFindings.ts";
