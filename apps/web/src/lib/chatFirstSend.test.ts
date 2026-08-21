// FILE: chatFirstSend.test.ts
// Purpose: Verifies first-send project routing — plain Home sends create apps,
//          folder mentions stay ordinary projects, everything else is current.

import { type ProjectId } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import type { Project } from "../types";
import { resolveFirstSendTarget } from "./chatFirstSend";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-home" as ProjectId,
    kind: "chat",
    name: "Home",
    remoteName: "Home",
    folderName: "tester",
    localName: null,
    cwd: "/Users/tester",
    defaultModelSelection: null,
    expanded: false,
    spaceId: null,
    scripts: [],
    ...overrides,
  };
}

describe("resolveFirstSendTarget", () => {
  it("targets a brand-new app for a plain home first send, named from the prompt", () => {
    const result = resolveFirstSendTarget({
      activeProject: makeProject(),
      createdAt: new Date(2026, 5, 11, 23, 30, 43),
      isFirstMessage: true,
      isHomeChatContainer: true,
      projects: [makeProject()],
      selectedWorkspaceRoot: null,
      title: "Yes it takes",
      titleSeed: "Yes, it takes all the skills!",
    });

    expect(result).toMatchObject({
      kind: "create-app",
      creation: {
        name: "yes-it-takes-all",
      },
    });
  });

  it("falls back to a cute name when the prompt yields no slug", () => {
    const result = resolveFirstSendTarget({
      activeProject: makeProject(),
      createdAt: new Date(2026, 5, 11, 23, 30, 43),
      isFirstMessage: true,
      isHomeChatContainer: true,
      projects: [makeProject()],
      selectedWorkspaceRoot: null,
      title: "New chat",
      titleSeed: "???",
    });

    expect(result.kind).toBe("create-app");
    if (result.kind === "create-app") {
      expect(result.creation.name.length).toBeGreaterThan(0);
      expect(result.creation.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("keeps folder mentions as ordinary projects", () => {
    const result = resolveFirstSendTarget({
      activeProject: makeProject(),
      createdAt: new Date(2026, 5, 11, 23, 30, 43),
      isFirstMessage: true,
      isHomeChatContainer: true,
      projects: [makeProject()],
      selectedWorkspaceRoot: "/Users/tester/Developer/app",
      title: "Use app",
      titleSeed: "Use app",
    });

    expect(result).toMatchObject({
      kind: "create-project",
      creation: {
        workspaceRoot: "/Users/tester/Developer/app",
        title: "app",
        kind: "project",
        createWorkspaceRootIfMissing: false,
      },
    });
  });

  it("uses the current project outside a home chat first send", () => {
    const activeProject = makeProject({ id: "project-app" as ProjectId, kind: "project" });
    const result = resolveFirstSendTarget({
      activeProject,
      createdAt: new Date(2026, 5, 11, 23, 30, 43),
      isFirstMessage: false,
      isHomeChatContainer: false,
      projects: [activeProject],
      selectedWorkspaceRoot: null,
      title: "Follow up",
      titleSeed: "Follow up",
    });

    expect(result).toMatchObject({
      kind: "current",
      target: {
        targetProjectId: "project-app",
        targetProjectKind: "project",
      },
    });
  });
});

describe("resolveFirstSendTarget composer model selection", () => {
  const baseInput = {
    activeProject: makeProject(),
    createdAt: new Date(2026, 5, 11, 23, 30, 43),
    isFirstMessage: true,
    isHomeChatContainer: true,
    projects: [makeProject()],
    title: "Build it",
    titleSeed: "Build it",
  };

  it("seeds a folder-mention project with the composer's picked model", () => {
    const result = resolveFirstSendTarget({
      ...baseInput,
      selectedWorkspaceRoot: "/Users/tester/Developer/app",
      composerModelSelection: { provider: "opencodeZen", model: "mimo-v2.5-free" },
    });

    expect(result.kind === "create-project" && result.creation.defaultModelSelection).toEqual({
      provider: "opencodeZen",
      model: "mimo-v2.5-free",
    });
  });

  it("keeps the groq default only when the composer had no explicit pick", () => {
    const result = resolveFirstSendTarget({
      ...baseInput,
      selectedWorkspaceRoot: "/Users/tester/Developer/app",
    });

    expect(result.kind === "create-project" && result.creation.defaultModelSelection).toEqual({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
  });
});
