import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { HarnessEvent, type HarnessEvent as HarnessEventType } from "./harnessEvents";
import { Session } from "./sessionContracts";
import { Project } from "./projectContracts";

describe("Harness Contracts", () => {
  it("validates token harness event", () => {
    const event: HarnessEventType = {
      type: "token",
      sessionId: "s-123",
      content: "Hello world",
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("token");
  });

  it("validates tool_call harness event", () => {
    const event: HarnessEventType = {
      type: "tool_call",
      sessionId: "s-123",
      id: "tc-1",
      name: "read_file",
      args: { path: "src/App.tsx" },
      status: "completed",
      result: "const App = () => null;",
      durationMs: 42,
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("tool_call");
  });

  it("validates stage harness event", () => {
    const event: HarnessEventType = {
      type: "stage",
      sessionId: "s-123",
      from: "routing",
      to: "planning",
      meta: { confidence: 0.95 },
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("stage");
  });

  it("validates checkpoint harness event", () => {
    const event: HarnessEventType = {
      type: "checkpoint",
      sessionId: "s-123",
      id: "cp-1",
      reason: "Review plan before build",
      requiresResponse: true,
      diff: "diff --git a/spec.md b/spec.md",
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("checkpoint");
  });

  it("validates artifact_updated harness event", () => {
    const event: HarnessEventType = {
      type: "artifact_updated",
      sessionId: "s-123",
      path: "src/components/Button.tsx",
      framework: "react-native",
      sizeBytes: 1024,
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("artifact_updated");
  });

  it("validates verifier_result harness event", () => {
    const event: HarnessEventType = {
      type: "verifier_result",
      sessionId: "s-123",
      passed: true,
      confidence: 0.92,
      tasteScore: 0.88,
      issues: [],
    };
    const decoded = Schema.decodeUnknownSync(HarnessEvent)(event);
    expect(decoded.type).toBe("verifier_result");
  });
});
