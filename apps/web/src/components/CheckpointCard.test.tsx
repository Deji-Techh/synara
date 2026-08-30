import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { CheckpointCard } from "./CheckpointCard.tsx";

describe("Milestone M17 — CheckpointCard Component (Human Review Gate)", () => {
  it("renders review required header, reason, and diff summary in HTML markup", () => {
    const onApprove = vi.fn();
    const onRequestChange = vi.fn();

    const markup = renderToStaticMarkup(
      <CheckpointCard
        id="chk-123"
        reason="Please review and approve App Plan for FitnessApp"
        diff="📋 App Plan: FitnessApp\n- Flow 1: Log workout\n- Flow 2: Analytics"
        onApprove={onApprove}
        onRequestChange={onRequestChange}
      />,
    );

    expect(markup).toContain("Review Required");
    expect(markup).toContain("Please review and approve App Plan for FitnessApp");
    expect(markup).toContain("App Plan: FitnessApp");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Request Change");
  });
});
