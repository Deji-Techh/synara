// FILE: ShareCard.test.tsx
// Purpose: Guards the upgraded share card: spotlight, six tiles, footer.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProfileStats, ProfileTokenStats } from "@caide/contracts";
import { ShareCard } from "./ShareCard";

const stats = {
  generatedAt: "2026-09-03T00:00:00.000Z",
  timezone: { utcOffsetMinutes: 0, today: "2026-09-03" },
  identity: { homeDirBasename: "dev", initials: "DT", defaultHandle: "@dev" },
  activity: {
    currentStreakDays: 5,
    longestStreakDays: 9,
    totalPromptsSent: 1234,
    totalThreads: 42,
    promptsToday: 3,
    heatmapMetric: "prompts",
    heatmap: [],
  },
  activeHours: { startHour: 9, endHour: 17, turnCount: 100, label: "9am–5pm" },
  insights: {
    topProvider: "openai",
    topProviderPercent: 60,
    topReasoning: null,
    topReasoningPercent: null,
    skillsExplored: 2,
    totalSkillsUsed: 3,
  },
  providerModels: [],
  skills: [],
  mostUsedSkill: null,
  mostWorkedProject: {
    projectId: "p1",
    title: "Todo App",
    workspaceRoot: "/tmp/x",
    promptCount: 120,
    threadCount: 6,
    activeDays: 4,
    lastWorkedAt: "2026-09-03T00:00:00.000Z",
  },
  frameworks: [{ framework: "website", count: 5, percent: 80 }],
  mostUsedFramework: "website",
  quota: {
    status: "unavailable",
    provider: null,
    window: null,
    usedPercent: null,
    resetsAt: null,
    planName: null,
  },
} as unknown as ProfileStats;

const tokenStats = {
  available: true,
  lifetimeTotalTokens: 2_500_000,
  peakDayTokens: 120_000,
  peakDay: "2026-09-01",
  providers: ["openai"],
  unavailableProviders: [],
  topProvider: "openai",
  topProviderPercent: 72,
  models: [{ provider: "openai", model: "gpt-5.6-sol", tokens: 1_000_000, percent: 40 }],
  heatmapMetric: "tokens",
  heatmap: [],
} as unknown as ProfileTokenStats;

describe("ShareCard", () => {
  it("renders spotlight, six tiles, and footer", () => {
    const markup = renderToStaticMarkup(
      <ShareCard
        stats={stats}
        tokenStats={tokenStats}
        displayName="Dev"
        handle="@dev"
        avatarColor="#123456"
        avatarImage={null}
      />,
    );
    expect(markup).toContain("Todo App");
    expect(markup).toContain("120 prompts");
    expect(markup).toContain("lifetime tokens");
    expect(markup).toContain("prompts sent");
    expect(markup).toContain("peak day");
    expect(markup).toContain("day streak");
    expect(markup).toContain("top provider");
    expect(markup).toContain("top stack");
    expect(markup).toContain("Website");
    expect(markup).toContain("gpt-5.6-sol");
    expect(markup).toContain("42 threads");
    expect(markup).toContain("9am–5pm");
  });

  it("omits spotlight and footer gracefully without data", () => {    const bare = {
      ...stats,
      mostWorkedProject: null,
      mostUsedFramework: null,
      frameworks: [],
      activeHours: { startHour: null, endHour: null, turnCount: 0, label: null },
      activity: { ...stats.activity, totalThreads: 0 },
    } as unknown as ProfileStats;
    const markup = renderToStaticMarkup(
      <ShareCard
        stats={bare}
        tokenStats={null}
        displayName="Dev"
        handle="@dev"
        avatarColor="#123456"
        avatarImage={null}
      />,
    );
    expect(markup).not.toContain("Building");
    expect(markup).toContain("top stack");
  });
});
