import type { ProjectFramework } from "@caide/contracts";

export interface SpecScreen {
  name: string;
  path: string;
  components: string[];
  hasEmptyState: boolean;
  hasLoadingState: boolean;
  hasErrorState: boolean;
}

export interface SpecFlow {
  name: string;
  steps: string[];
}

export interface SpecSlice {
  name: string;
  description: string;
  files: string[];
  acceptanceCriteria: string[];
}

export interface SpecDoc {
  appName: string;
  targetUser: string;
  userContext: string;
  flows: SpecFlow[];
  framework: ProjectFramework;
  v1Scope: string[];
  v1OutOfScope: string[];
  screens: SpecScreen[];
  slices: SpecSlice[];
}

export interface SpecValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

const VALID_FRAMEWORKS = new Set<ProjectFramework>(["blank", "react-native", "flutter", "website"]);

export function validateSpec(spec: Partial<SpecDoc>): SpecValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // 1. Core Identity & User
  if (!spec.appName || spec.appName.trim().length === 0) {
    missing.push("appName (Application Name is required)");
  }
  if (!spec.targetUser || spec.targetUser.trim().length === 0) {
    missing.push("targetUser (Target User archetype is required)");
  }
  if (!spec.userContext || spec.userContext.trim().length === 0) {
    missing.push("userContext (Context/Problem statement is required)");
  }

  // 2. Platform & Framework
  if (!spec.framework || !VALID_FRAMEWORKS.has(spec.framework)) {
    missing.push("framework (Must be one of: blank, react-native, flutter, website)");
  }

  // 3. User Flows (3-5 flows required, each with >= 2 steps)
  if (!spec.flows || !Array.isArray(spec.flows) || spec.flows.length === 0) {
    missing.push("flows (At least 1-5 core user flows are required)");
  } else {
    if (spec.flows.length < 2) {
      warnings.push("Spec has fewer than 2 flows; recommended 3-5 core user flows.");
    }
    if (spec.flows.length > 5) {
      warnings.push("Spec has more than 5 flows; recommend narrowing scope for v1.");
    }
    for (let i = 0; i < spec.flows.length; i++) {
      const flow = spec.flows[i];
      if (!flow.name || flow.name.trim().length === 0) {
        missing.push(`flows[${i}].name (Flow name missing)`);
      }
      if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length < 2) {
        missing.push(
          `flows[${i}].steps (Flow '${flow.name || i}' must define at least 2 interaction steps)`,
        );
      }
    }
  }

  // 4. V1 Scope & Scope Creep Guard
  if (!spec.v1Scope || !Array.isArray(spec.v1Scope) || spec.v1Scope.length === 0) {
    missing.push("v1Scope (Explicit v1 scope list is required)");
  } else if (spec.v1Scope.length > 10) {
    missing.push(
      `v1Scope (Scope creep guard: v1 cannot exceed 10 features, found ${spec.v1Scope.length})`,
    );
  }

  // 5. Out of Scope Explicit List
  if (!spec.v1OutOfScope || !Array.isArray(spec.v1OutOfScope) || spec.v1OutOfScope.length === 0) {
    missing.push(
      "v1OutOfScope (Explicit list of features excluded from v1 is required to prevent scope drift)",
    );
  }

  // 6. Screens & Mandatory States
  if (!spec.screens || !Array.isArray(spec.screens) || spec.screens.length === 0) {
    missing.push("screens (At least 1 screen breakdown is required)");
  } else {
    for (let i = 0; i < spec.screens.length; i++) {
      const scr = spec.screens[i];
      if (!scr.name) missing.push(`screens[${i}].name is required`);
      if (
        scr.hasEmptyState === undefined ||
        scr.hasLoadingState === undefined ||
        scr.hasErrorState === undefined
      ) {
        missing.push(
          `screens[${i}] ('${scr.name || i}') must explicitly declare hasEmptyState, hasLoadingState, and hasErrorState`,
        );
      }
    }
  }

  // 7. Slices
  if (!spec.slices || !Array.isArray(spec.slices) || spec.slices.length === 0) {
    missing.push("slices (At least 1 verifiable implementation slice is required)");
  } else if (spec.slices.length > 5) {
    warnings.push(`Spec defines ${spec.slices.length} slices; recommend 2-5 slices max per build.`);
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}
