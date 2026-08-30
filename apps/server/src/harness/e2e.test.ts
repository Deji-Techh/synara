import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { Session, SessionStorage } from "./session/index.ts";
import { ContextMemory } from "./context/index.ts";
import { classifyIntent } from "./router/index.ts";
import { Planner } from "./planner/index.ts";
import { Builder } from "./builder/index.ts";
import { verifySlice } from "./verifier/index.ts";
import { evaluateTaste } from "./taste/index.ts";
import { runEdgeSweep } from "./edge/index.ts";
import { AdversarialRunner } from "./quality/adversarial.ts";
import { auditSecurity } from "./quality/security.ts";
import { auditPerformance } from "./quality/performance.ts";
import { ComparativeBenchmark } from "./quality/benchmark.ts";
import { RollingCompactor } from "./compaction/index.ts";
import { ProjectLogStore } from "./selfImprove/index.ts";
import { scaffoldProject } from "./scaffold/index.ts";
import type { LLMAdapter } from "./loop/loop.ts";

describe("Milestone M27 — Complete Pure Caide Harness E2E Acceptance Pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-e2e-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("executes the full Router → Planner → Checkpoint → Builder → Verifier → Taste → Quality → Compaction cycle", async () => {
    // 1. Session Storage Setup
    const storage = new SessionStorage({ baseDir: path.join(tempDir, "sessions") });
    const session = new Session("sess-e2e-1", storage);
    expect(session.sessionId).toBe("sess-e2e-1");

    // 2. Project Scaffolding
    const projectDir = path.join(tempDir, "workspace");
    const scaffoldFiles = await scaffoldProject("react-native", projectDir, "HabitTracker");
    expect(scaffoldFiles).toContain("package.json");
    expect(scaffoldFiles).toContain(".caide/design-spec.json");

    // 3. Router Intent Classification
    const chatMsg = "build a habit tracking mobile app with daily streaks";
    const routerDecision = await classifyIntent(chatMsg);
    expect(routerDecision.intent).toBe("build");
    expect(routerDecision.model).toBe("strong");

    // 4. Planner: Generate Spec, Architecture, and Checkpoint Gate 1
    const planner = new Planner();
    const planResult = await planner.generatePlan(
      "HabitTracker",
      "react-native",
      "Track daily habits, streaks, and analytics",
    );
    expect(planResult.specDoc.flows.length).toBeGreaterThanOrEqual(3);
    expect(planResult.specDoc.screens[0].hasEmptyState).toBe(true);
    expect(planResult.checkpointEvent.type).toBe("checkpoint");
    expect((planResult.checkpointEvent as any).reason).toContain("App Plan Approval");

    // 5. Human Gate 1: Plan Approved (simulated)
    const approvedPlan = planResult.specDoc;
    await Planner.persistPlanArtifacts(approvedPlan, projectDir);

    // 6. Builder: Generate Slice 1 with per-slice isolation and Design Tokens
    const homeScreenCode = `
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colorTokens, spacingUnit } from '../design/tokens';

const spring = { stiffness: 400, damping: 30 };

export function HomeScreen({ habits, isLoading, error, onRetry, navigation }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Loading State
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colorTokens.accent} />
      </View>
    );
  }

  // 2. Error State
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
        <Text style={{ color: colorTokens.error }}>Failed to load habit streaks.</Text>
        <TouchableOpacity
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={onRetry}
        >
          <Text style={{ color: colorTokens.textPrimary }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Empty State
  if (!habits || habits.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, justifyContent: 'center', alignItems: 'center', padding: spacingUnit * 4 }}>
        <Text style={{ color: colorTokens.textPrimary, fontSize: 18, fontWeight: 'bold' }}>Empty State: No Habits Found</Text>
        <Text style={{ color: colorTokens.textMuted, marginTop: spacingUnit }}>Start your first streak today.</Text>
        <TouchableOpacity
          style={{ minHeight: 44, paddingHorizontal: 20, backgroundColor: colorTokens.accent, borderRadius: 999, marginTop: spacingUnit * 4, justifyContent: 'center' }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Text style={{ color: colorTokens.textPrimary }}>Add Habit</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 4. Content State
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <Text numberOfLines={1} className="truncate text-2xl font-bold" style={{ color: colorTokens.textPrimary }}>
        Today's Streaks
      </Text>
      <View className="rounded-full bg-emerald-500/20 px-3 py-1 self-start my-2">
        <Text className="text-xs text-emerald-400 font-semibold">Streak Count: 5 Days</Text>
      </View>
      <TouchableOpacity
        disabled={isSubmitting}
        style={{ minHeight: 44, backgroundColor: colorTokens.accent, borderRadius: 999, justifyContent: 'center', marginTop: spacingUnit * 4 }}
        onPress={() => {
          setIsSubmitting(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        <Text style={{ color: colorTokens.textPrimary, textAlign: 'center' }}>Complete Day</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
`;

    const firstSlice = approvedPlan.slices[0];
    const fakeLlm: LLMAdapter = {
      async *stream() {
        yield {
          type: "tool_call",
          toolCall: {
            id: "call-1",
            name: "write_file",
            args: {
              path: "src/screens/HomeScreen.tsx",
              content: homeScreenCode,
            },
          },
        };
        yield { type: "token", content: "Screen built successfully." };
      },
    };

    const buildResult = await Builder.buildSlice({
      sessionId: session.sessionId,
      slice: firstSlice,
      spec: approvedPlan,
      appPath: projectDir,
      framework: "react-native",
      llm: fakeLlm,
    });

    expect(buildResult.success).toBe(true);
    expect(buildResult.artifactsCreated.length).toBeGreaterThan(0);

    const files = { "src/screens/HomeScreen.tsx": homeScreenCode };

    // 7. Verifier: Exact Token Audit, 44px Touch Targets, Mandatory States
    const verification = verifySlice(files);
    expect(verification.passed).toBe(true);
    expect(verification.violations.length).toBe(0);

    // 8. Taste Model: Aesthetic Polish & Anti-AI Slop
    const taste = evaluateTaste(files);
    expect(taste.passed).toBe(true);
    expect(taste.score).toBeGreaterThanOrEqual(0.8);
    expect(taste.antiSlopViolations.length).toBe(0);

    // 9. Systematic Quality Passes: Edge Sweep, Adversarial, Security, Perf, Benchmark
    const edgeSweep = runEdgeSweep(firstSlice.name, files);
    expect(edgeSweep.passed).toBe(true);

    const advResult = AdversarialRunner.testScreenCode("HomeScreen", homeScreenCode);
    expect(advResult.passed).toBe(true);

    const secAudit = auditSecurity(files);
    expect(secAudit.passed).toBe(true);

    const perfAudit = auditPerformance(files);
    expect(perfAudit.passed).toBe(true);

    const benchmark = ComparativeBenchmark.runBenchmark("productivity", "react-native", files);
    expect(benchmark.passed).toBe(true);
    expect(benchmark.benchmarkScore).toBeGreaterThanOrEqual(0.75);

    // 10. Rolling Compaction: Trigger at 70% threshold
    const memory = new ContextMemory();
    memory.append({ role: "system", content: "You are Caide builder." });
    for (let i = 0; i < 5; i++) {
      memory.append({ role: "user", content: "u".repeat(2000) });
      memory.append({ role: "assistant", content: "a".repeat(2000) });
    }
    const compactor = new RollingCompactor();
    const compactionResult = await compactor.compact(memory, 2000, approvedPlan);
    expect(compactionResult.compacted).toBe(true);
    expect(compactionResult.summary).toBeDefined();

    // 11. Self-Improving Loop: Record project run telemetry
    const logStore = new ProjectLogStore(path.join(tempDir, "telemetry"));
    await logStore.appendLog({
      projectId: "proj-e2e-1",
      framework: "react-native",
      skills: ["ui-ux-mastery", "platform-patterns", "motion-interaction"],
      verifierPassRate: 1.0,
      fixerRetryCount: 0,
      tasteScore: taste.score,
      benchmarkScore: benchmark.benchmarkScore,
      edgeCasesFound: [],
      timestamp: Date.now(),
    });

    const logs = await logStore.readLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].verifierPassRate).toBe(1.0);
  });
});
