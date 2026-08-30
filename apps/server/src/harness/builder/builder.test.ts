import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Builder } from "./index.ts";
import { SliceManager } from "../slice/index.ts";
import type { SpecDoc } from "../planner/specValidator.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import type { HarnessEvent } from "@caide/contracts";

describe("Milestone M8 — Builder (Per-Slice, Fresh Context, Design Tokens)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-builder-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const testSpec: SpecDoc = {
    appName: "CommerceApp",
    targetUser: "Shopper",
    userContext: "Browses products and places orders seamlessly.",
    framework: "react-native",
    flows: [
      { name: "Browse", steps: ["Open app", "Scroll catalog", "Tap item"] },
      { name: "Checkout", steps: ["Add to cart", "Pay", "View receipt"] },
    ],
    v1Scope: ["Product catalog", "Cart", "Checkout"],
    v1OutOfScope: ["AR preview", "Subscription billing"],
    screens: [
      {
        name: "Catalog",
        path: "src/screens/CatalogScreen.tsx",
        components: ["ProductGrid", "SearchBar"],
        hasEmptyState: true,
        hasLoadingState: true,
        hasErrorState: true,
      },
    ],
    slices: [
      {
        name: "Catalog Slice",
        description: "Build catalog screen with empty/loading/error states and tokens.",
        files: ["src/screens/CatalogScreen.tsx"],
        acceptanceCriteria: [
          "Uses colorTokens.background #0D0D0D",
          "Includes EmptyState, LoadingSkeleton, ErrorBanner",
          "Minimum 44px tap targets",
        ],
      },
      {
        name: "Cart Slice",
        description: "Build cart flow with checkout button.",
        files: ["src/screens/CartScreen.tsx"],
        acceptanceCriteria: ["Cart list and checkout CTA"],
      },
    ],
  };

  it("builder builds a slice emitting artifact_updated events and persisting code with all required states", async () => {
    const catalogScreenCode = `
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colorTokens, typeScale, spacingUnit } from '../design/tokens';

export function CatalogScreen({ items, isLoading, error, onRetry }: any) {
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
        <Text style={{ color: colorTokens.error }}>Failed to load catalog</Text>
        <TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={onRetry}>
          <Text style={{ color: colorTokens.textPrimary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Empty State
  if (!items || items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colorTokens.textPrimary }}>No products found</Text>
        <TouchableOpacity style={{ minHeight: 44, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 999 }}>
          <Text style={{ color: '#0D0D0D' }}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 4. Content State
  return (
    <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <Text style={{ color: colorTokens.textPrimary }}>Product Catalog</Text>
    </View>
  );
}
`;

    const fakeLlm: LLMAdapter = {
      async *stream() {
        yield {
          type: "tool_call",
          toolCall: {
            id: "call-write-1",
            name: "write_file",
            args: {
              path: "src/screens/CatalogScreen.tsx",
              content: catalogScreenCode,
            },
          },
        };
        yield { type: "token", content: "Catalog screen built successfully." };
      },
    };

    const sliceManager = SliceManager.fromSpec(testSpec);
    const slice = sliceManager.getNextSlice()!;
    expect(slice.name).toBe("Catalog Slice");

    const events: HarnessEvent[] = [];
    const result = await Builder.buildSlice({
      sessionId: "session-builder-1",
      slice,
      spec: testSpec,
      appPath: tempDir,
      framework: "react-native",
      llm: fakeLlm,
      onEvent: (ev) => events.push(ev),
    });

    expect(result.success).toBe(true);
    expect(result.artifactsCreated).toContain("src/screens/CatalogScreen.tsx");

    // Verify artifact_updated event was emitted
    const artifactEvent = events.find((e) => e.type === "artifact_updated");
    expect(artifactEvent).toBeDefined();
    expect((artifactEvent as any).path).toBe("src/screens/CatalogScreen.tsx");

    // Verify file exists on disk with full content
    const diskPath = path.join(tempDir, "src", "screens", "CatalogScreen.tsx");
    expect(fs.existsSync(diskPath)).toBe(true);
    const diskContent = fs.readFileSync(diskPath, "utf-8");
    expect(diskContent).toContain("colorTokens.background");
    expect(diskContent).toContain("minHeight: 44");
    expect(diskContent).toContain("Loading State");
    expect(diskContent).toContain("Error State");
    expect(diskContent).toContain("Empty State");
  });

  it("enforces fresh context across slices — slice 2 does not inherit slice 1's tool trace", async () => {
    let capturedMessagesInSlice2: any[] = [];

    const fakeLlmSlice1: LLMAdapter = {
      async *stream() {
        yield {
          type: "tool_call",
          toolCall: {
            id: "c1-tool",
            name: "write_file",
            args: { path: "src/screens/CatalogScreen.tsx", content: "// catalog" },
          },
        };
      },
    };

    const fakeLlmSlice2: LLMAdapter = {
      async *stream(messages) {
        capturedMessagesInSlice2 = messages;
        yield {
          type: "tool_call",
          toolCall: {
            id: "c2-tool",
            name: "write_file",
            args: { path: "src/screens/CartScreen.tsx", content: "// cart" },
          },
        };
      },
    };

    const sliceManager = SliceManager.fromSpec(testSpec);

    // Build Slice 1
    const slice1 = sliceManager.getNextSlice()!;
    await Builder.buildSlice({
      sessionId: "session-fresh",
      slice: slice1,
      spec: testSpec,
      appPath: tempDir,
      framework: "react-native",
      llm: fakeLlmSlice1,
    });
    sliceManager.markCompleted(slice1.id);

    // Build Slice 2
    const slice2 = sliceManager.getNextSlice()!;
    expect(slice2.name).toBe("Cart Slice");

    await Builder.buildSlice({
      sessionId: "session-fresh",
      slice: slice2,
      spec: testSpec,
      appPath: tempDir,
      framework: "react-native",
      llm: fakeLlmSlice2,
    });

    // Verify slice 2's context does NOT contain slice 1's tool calls
    expect(capturedMessagesInSlice2.length).toBeGreaterThan(0);
    const hasSlice1ToolUse = capturedMessagesInSlice2.some(
      (m) => Array.isArray(m.content) && m.content.some((b: any) => b.id === "c1-tool"),
    );
    expect(hasSlice1ToolUse).toBe(false);
  });

  it("handles self-patching when files are missing on first pass and recovers on retry", async () => {
    let attempts = 0;

    const fakeLlmWithSelfPatch: LLMAdapter = {
      async *stream() {
        attempts += 1;
        if (attempts === 1) {
          // Model talked but forgot to write the file
          yield { type: "token", content: "I forgot to call write_file..." };
        } else {
          // Model self-patches and calls write_file
          yield {
            type: "tool_call",
            toolCall: {
              id: "patch-write",
              name: "write_file",
              args: { path: "src/screens/CatalogScreen.tsx", content: "// patched catalog" },
            },
          };
        }
      },
    };

    const sliceManager = SliceManager.fromSpec(testSpec);
    const slice = sliceManager.getNextSlice()!;

    const result = await Builder.buildSlice({
      sessionId: "session-patch",
      slice,
      spec: testSpec,
      appPath: tempDir,
      framework: "react-native",
      llm: fakeLlmWithSelfPatch,
      maxSelfPatchAttempts: 2,
    });

    expect(result.success).toBe(true);
    expect(result.selfPatchAttempts).toBe(1);
    expect(fs.existsSync(path.join(tempDir, "src/screens/CatalogScreen.tsx"))).toBe(true);
  });
});
