import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessEvent } from "@caide/contracts";
import {
  validateSpec,
  type SpecDoc,
  type SpecValidationResult,
  type SpecFlow,
  type SpecScreen,
  type SpecSlice,
} from "./specValidator.ts";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export * from "./specValidator.ts";

export class Planner {
  /**
   * Validates a spec document and, if valid, writes all spec and design token artifacts
   * (.caide/spec.md, architecture.md, .caide/design-spec.json, .caide/motion-spec.json).
   */
  static async persistPlanArtifacts(spec: SpecDoc, appPath: string): Promise<SpecValidationResult> {
    const validation = validateSpec(spec);
    if (!validation.valid) {
      return validation;
    }

    const caideDir = path.join(appPath, ".caide");
    await fs.promises.mkdir(caideDir, { recursive: true });

    // 1. Write .caide/spec.md
    const specMd = Planner.formatSpecMarkdown(spec);
    await fs.promises.writeFile(path.join(caideDir, "spec.md"), specMd, "utf-8");

    // 2. Write architecture.md
    const archMd = Planner.formatArchitectureMarkdown(spec);
    await fs.promises.writeFile(path.join(appPath, "architecture.md"), archMd, "utf-8");

    // 3. Write .caide/design-spec.json
    const designSpec = Planner.generateDesignSpec(spec);
    await fs.promises.writeFile(
      path.join(caideDir, "design-spec.json"),
      JSON.stringify(designSpec, null, 2),
      "utf-8",
    );

    // 4. Write .caide/motion-spec.json
    const motionSpec = Planner.generateMotionSpec(spec);
    await fs.promises.writeFile(
      path.join(caideDir, "motion-spec.json"),
      JSON.stringify(motionSpec, null, 2),
      "utf-8",
    );

    return validation;
  }

  /**
   * Generates human-facing plan card for the ChatView CheckpointCard.
   */
  static formatPlanCard(spec: SpecDoc): string {
    const flowsText = spec.flows
      .map((f, i) => `  ${i + 1}. **${f.name}**: ${f.steps.join(" → ")}`)
      .join("\n");

    const outOfScopeText = spec.v1OutOfScope.map((item) => `  - ${item}`).join("\n");
    const slicesText = spec.slices.map((s, i) => `  - Slice ${i + 1}: **${s.name}** (${s.files.join(", ")})`).join("\n");

    return [
      `📋 **App Plan: ${spec.appName}**`,
      `**User:** ${spec.targetUser} — *${spec.userContext}*`,
      `**Framework:** \`${spec.framework}\``,
      `\n**Core User Flows:**\n${flowsText}`,
      `\n**Implementation Slices:**\n${slicesText}`,
      `\n**Out of Scope for v1:**\n${outOfScopeText}`,
    ].join("\n");
  }

  /**
   * Creates a typed CheckpointHarnessEvent representing the Human Approval Gate #1.
   */
  static createPlanCheckpointEvent(sessionId: string, spec: SpecDoc): HarnessEvent {
    const planCard = Planner.formatPlanCard(spec);
    return {
      type: "checkpoint",
      sessionId,
      id: `checkpoint-plan-${Date.now()}`,
      reason: `App Plan Approval for '${spec.appName}'`,
      requiresResponse: true,
      diff: planCard,
    };
  }

  static formatSpecMarkdown(spec: SpecDoc): string {
    const flowsSection = spec.flows
      .map(
        (f, i) => `### Flow ${i + 1}: ${f.name}\n${f.steps.map((s, si) => `${si + 1}. ${s}`).join("\n")}`,
      )
      .join("\n\n");

    const screensSection = spec.screens
      .map(
        (s) =>
          `### Screen: ${s.name} (\`${s.path}\`)\n- **Components**: ${s.components.join(", ")}\n- **Mandatory States**: Empty State (${s.hasEmptyState ? "Yes" : "No"}), Loading State (${s.hasLoadingState ? "Yes" : "No"}), Error State (${s.hasErrorState ? "Yes" : "No"})`,
      )
      .join("\n\n");

    const slicesSection = spec.slices
      .map(
        (sl, i) =>
          `### Slice ${i + 1}: ${sl.name}\n- **Description**: ${sl.description}\n- **Files**: ${sl.files.map((f) => `\`${f}\``).join(", ")}\n- **Acceptance Criteria**:\n${sl.acceptanceCriteria.map((c) => `  - [ ] ${c}`).join("\n")}`,
      )
      .join("\n\n");

    return `# Specification: ${spec.appName}

## 1. Target Audience & Problem Statement
- **Target User**: ${spec.targetUser}
- **Context**: ${spec.userContext}
- **Framework**: ${spec.framework}

## 2. Core User Flows
${flowsSection}

## 3. Screen Breakdown
${screensSection}

## 4. Implementation Slices
${slicesSection}

## 5. Scope Boundaries
### v1 Scope
${spec.v1Scope.map((item) => `- ${item}`).join("\n")}

### v1 Out of Scope
${spec.v1OutOfScope.map((item) => `- ${item}`).join("\n")}
`;
  }

  static formatArchitectureMarkdown(spec: SpecDoc): string {
    return `# Architecture: ${spec.appName}

## Technology Stack
- **Framework**: ${spec.framework}
- **Design System**: Caide Design Tokens (strict adherence to \`.caide/design-spec.json\`)
- **Motion System**: Physics-grounded springs (\`.caide/motion-spec.json\`)

## Module Hierarchy
${spec.screens.map((s) => `- \`${s.path}\` → ${s.name} (${s.components.join(", ")})`).join("\n")}

## State & Data Flow
- Unidirectional state management
- Error boundaries on all asynchronous data boundaries
- Dedicated loading skeleton and empty state components per screen
`;
  }

  static generateDesignSpec(spec: SpecDoc): Record<string, unknown> {
    return {
      appName: spec.appName,
      framework: spec.framework,
      colorTokens,
      typeScale,
      componentRules,
      radius,
      spacingUnit: 4,
    };
  }

  static generateMotionSpec(spec: SpecDoc): Record<string, unknown> {
    return {
      appName: spec.appName,
      spring: {
        stiffness: 400,
        damping: 30,
        mass: 1,
      },
      durations: {
        micro: "150ms",
        standard: "220ms",
        modal: "280ms",
      },
      easing: "ease-out",
      prefersReducedMotion: "prefers-reduced-motion: 0ms",
    };
  }
}
