import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Fixer } from "./index.ts";
import { Verifier } from "../verifier/index.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import type { HarnessEvent } from "@caide/contracts";

describe("Milestone M10 — Fixer (Targeted Patch, Max Retries, Human Escalation)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fixer-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("applies surgical targeted patch replacing exact faulty token without touching surrounding code", async () => {
    const originalFile = `
import React from 'react';
import { View, Text } from 'react-native';

export function ProfileScreen() {
  const empty = <Text>No profile found</Text>;
  const loading = <Text>Loading profile...</Text>;
  const error = <Text>Failed to load profile</Text>;

  return (
    <View style={{ backgroundColor: '#0D0D0D', minHeight: 44 }}>
      <Text style={{ color: '#FFFFFF' }}>User Name</Text>
    </View>
  );
}
`;

    const filePath = path.join(tempDir, "ProfileScreen.tsx");
    fs.writeFileSync(filePath, originalFile, "utf-8");

    // Apply surgical patch on line backgroundColor: '#0D0D0D' -> backgroundColor: colorTokens.background
    const success = await Fixer.applyTargetedPatch(
      filePath,
      "backgroundColor: '#0D0D0D'",
      "backgroundColor: colorTokens.background",
    );

    expect(success).toBe(true);
    const patchedContent = fs.readFileSync(filePath, "utf-8");
    expect(patchedContent).toContain("backgroundColor: colorTokens.background");
    expect(patchedContent).toContain("<Text style={{ color: '#FFFFFF' }}>User Name</Text>");
    expect(patchedContent).toContain("const empty = <Text>No profile found</Text>;");
  });

  it("fix -> re-verify cycle passes on second attempt when model patches file correctly", async () => {
    const brokenFile = `
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function SettingsScreen() {
  // Empty, Loading, and Error states
  const empty = <Text>No settings found</Text>;
  const loading = <Text>Loading settings...</Text>;
  const error = <Text>Failed to load settings</Text>;

  return (
    <View style={{ backgroundColor: '#0D0D0D', minHeight: 44 }}>
      <TouchableOpacity style={{ height: 24 }}>
        <Text>Save</Text>
      </TouchableOpacity>
    </View>
  );
}
`;

    const relPath = "SettingsScreen.tsx";
    const fullPath = path.join(tempDir, relPath);
    fs.writeFileSync(fullPath, brokenFile, "utf-8");

    const initialVerify = await Verifier.verifyWorkspaceFiles(tempDir, [relPath]);
    expect(initialVerify.passed).toBe(false);

    const fixedFile = `
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colorTokens } from '../design/tokens';

export function SettingsScreen() {
  const empty = <Text>No settings found</Text>;
  const loading = <Text>Loading settings...</Text>;
  const error = <Text>Failed to load settings</Text>;

  return (
    <View style={{ backgroundColor: colorTokens.background, minHeight: 44 }}>
      <TouchableOpacity style={{ minHeight: 44 }}>
        <Text style={{ color: colorTokens.textPrimary }}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}
`;

    const fakeFixerLlm: LLMAdapter = {
      async *stream() {
        yield {
          type: "tool_call",
          toolCall: {
            id: "fix-tool-call",
            name: "write_file",
            args: {
              path: relPath,
              content: fixedFile,
            },
          },
        };
      },
    };

    const events: HarnessEvent[] = [];
    const result = await Fixer.fixIssues({
      sessionId: "session-fix-pass",
      appPath: tempDir,
      framework: "react-native",
      verifyResult: initialVerify,
      targetFiles: [relPath],
      llm: fakeFixerLlm,
      onEvent: (ev) => events.push(ev),
    });

    expect(result.fixed).toBe(true);
    expect(result.attemptsUsed).toBe(1);
    expect(result.escalatedToHuman).toBe(false);

    // Verify stage transitions
    const stages = events.filter((e) => e.type === "stage");
    expect(stages.some((s) => (s as any).to === "fixing")).toBe(true);
    expect(stages.some((s) => (s as any).to === "verifying")).toBe(true);
  });

  it("escalates to human checkpoint after 3 failed fix attempts", async () => {
    const unfixableBrokenFile = `
import React from 'react';
import { View, Text } from 'react-native';

export function UnfixableScreen() {
  return (
    <View style={{ backgroundColor: '#0D0D0D' }}>
      <Text>Missing all states and bad color</Text>
    </View>
  );
}
`;

    const relPath = "UnfixableScreen.tsx";
    const fullPath = path.join(tempDir, relPath);
    fs.writeFileSync(fullPath, unfixableBrokenFile, "utf-8");

    const initialVerify = await Verifier.verifyWorkspaceFiles(tempDir, [relPath]);
    expect(initialVerify.passed).toBe(false);

    // LLM fails to write valid fixes
    const uselessLlm: LLMAdapter = {
      async *stream() {
        yield { type: "token", content: "I cannot fix this without user guidance." };
      },
    };

    const events: HarnessEvent[] = [];
    const result = await Fixer.fixIssues({
      sessionId: "session-fix-fail",
      appPath: tempDir,
      framework: "react-native",
      verifyResult: initialVerify,
      targetFiles: [relPath],
      llm: uselessLlm,
      maxAttempts: 3,
      onEvent: (ev) => events.push(ev),
    });

    expect(result.fixed).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(result.escalatedToHuman).toBe(true);
    expect(result.checkpointEvent).toBeDefined();

    // Verify checkpoint event was emitted
    const checkpoint = events.find((e) => e.type === "checkpoint");
    expect(checkpoint).toBeDefined();
    expect((checkpoint as any).requiresResponse).toBe(true);
    expect((checkpoint as any).diff).toContain("Human Assistance Required");
  });
});
