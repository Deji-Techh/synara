import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Planner, validateSpec, type SpecDoc } from "./index.ts";
import { classifyIntentSync } from "../router/index.ts";

describe("Milestone M7 — Planner (Spec Gate & Human Checkpoint)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-planner-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const validSampleSpec: SpecDoc = {
    appName: "FitTrack",
    targetUser: "Fitness Enthusiast",
    userContext: "Tracks daily workouts and visualizes calorie burn trends.",
    framework: "react-native",
    flows: [
      {
        name: "Log Workout",
        steps: ["Open app", "Select exercise type", "Enter sets/reps", "Save workout"],
      },
      {
        name: "View Analytics",
        steps: ["Tap analytics tab", "Toggle weekly/monthly view", "Inspect progress chart"],
      },
      {
        name: "Manage Profile",
        steps: ["Tap profile icon", "Update target weight", "Save preferences"],
      },
    ],
    v1Scope: [
      "Workout logging",
      "Exercise library",
      "Weekly analytics chart",
      "User profile settings",
    ],
    v1OutOfScope: [
      "Social feed and friend sharing",
      "AI camera pose estimation",
      "Wearable BLE sync",
    ],
    screens: [
      {
        name: "Dashboard",
        path: "src/screens/DashboardScreen.tsx",
        components: ["WorkoutSummaryCard", "QuickLogButton", "WeeklyChart"],
        hasEmptyState: true,
        hasLoadingState: true,
        hasErrorState: true,
      },
      {
        name: "LogWorkout",
        path: "src/screens/LogWorkoutScreen.tsx",
        components: ["ExercisePicker", "SetsRepsInput", "SaveButton"],
        hasEmptyState: true,
        hasLoadingState: true,
        hasErrorState: true,
      },
    ],
    slices: [
      {
        name: "Slice 1 — Foundation & Dashboard",
        description: "Scaffolds app navigation, state, and dashboard with empty/loading states.",
        files: ["src/App.tsx", "src/screens/DashboardScreen.tsx", "src/components/WeeklyChart.tsx"],
        acceptanceCriteria: [
          "Dashboard renders with design tokens",
          "Empty state displays when no workouts logged",
          "All tap targets >= 44px",
        ],
      },
      {
        name: "Slice 2 — Workout Logger",
        description: "Implements exercise selection and set/rep logging form.",
        files: ["src/screens/LogWorkoutScreen.tsx", "src/state/workoutStore.ts"],
        acceptanceCriteria: [
          "Can add exercises and record sets",
          "Persists workouts locally",
        ],
      },
    ],
  };

  it("first message for a new project routes into Plan mode, enforcing spec gate before any code", () => {
    const decision = classifyIntentSync("Build me a fitness tracking app", {
      isNewProject: true,
      hasSpec: false,
    });

    expect(decision.intent).toBe("plan");
    expect(decision.tier).toBe("manual");
    expect(decision.model).toBe("medium");
  });

  it("validates spec successfully and creates all spec and design token artifacts on disk", async () => {
    const result = await Planner.persistPlanArtifacts(validSampleSpec, tempDir);
    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);

    // Verify written files on disk
    const specPath = path.join(tempDir, ".caide", "spec.md");
    const archPath = path.join(tempDir, "architecture.md");
    const designPath = path.join(tempDir, ".caide", "design-spec.json");
    const motionPath = path.join(tempDir, ".caide", "motion-spec.json");

    expect(fs.existsSync(specPath)).toBe(true);
    expect(fs.existsSync(archPath)).toBe(true);
    expect(fs.existsSync(designPath)).toBe(true);
    expect(fs.existsSync(motionPath)).toBe(true);

    const specContent = fs.readFileSync(specPath, "utf-8");
    expect(specContent).toContain("# Specification: FitTrack");
    expect(specContent).toContain("Flow 1: Log Workout");
    expect(specContent).toContain("Slice 1 — Foundation & Dashboard");

    const designContent = JSON.parse(fs.readFileSync(designPath, "utf-8"));
    expect(designContent.colorTokens.background).toBe("#0D0D0D");
    expect(designContent.colorTokens.accent).toBe("#E8493C");
  });

  it("fails validation with clear error messages when required spec fields or states are missing", () => {
    const invalidSpec: Partial<SpecDoc> = {
      appName: "",
      targetUser: "",
      flows: [],
      framework: "react-native",
    };

    const result = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.missing.some((m) => m.includes("appName"))).toBe(true);
    expect(result.missing.some((m) => m.includes("targetUser"))).toBe(true);
    expect(result.missing.some((m) => m.includes("flows"))).toBe(true);
    expect(result.missing.some((m) => m.includes("v1OutOfScope"))).toBe(true);
  });

  it("scope creep guard rejects specs with more than 10 v1 features", () => {
    const bloatedSpec: SpecDoc = {
      ...validSampleSpec,
      v1Scope: [
        "F1", "F2", "F3", "F4", "F5",
        "F6", "F7", "F8", "F9", "F10",
        "F11 - Over limit feature",
      ],
    };

    const result = validateSpec(bloatedSpec);
    expect(result.valid).toBe(false);
    expect(result.missing.some((m) => m.includes("Scope creep guard"))).toBe(true);
  });

  it("creates a properly formatted checkpoint event with plan card for human approval gate", () => {
    const event = Planner.createPlanCheckpointEvent("session-plan-1", validSampleSpec);

    expect(event.type).toBe("checkpoint");
    expect((event as any).requiresResponse).toBe(true);
    expect((event as any).reason).toContain("App Plan Approval");

    const diff = (event as any).diff as string;
    expect(diff).toContain("📋 **App Plan: FitTrack**");
    expect(diff).toContain("Core User Flows:");
    expect(diff).toContain("Out of Scope for v1:");
    expect(diff).toContain("**Framework:** `react-native`");
  });
});
