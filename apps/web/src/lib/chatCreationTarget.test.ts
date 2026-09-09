// FILE: chatCreationTarget.test.ts
// Purpose: Cover app-vs-folder routing for new-chat intent.
// Layer: Web unit test

import type { ProjectId } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import { resolveChatCreationTarget } from "./chatCreationTarget";

const PATHS = { homeDir: "/home/DejiTech", chatWorkspaceRoot: "/home/DejiTech/caide-chat" };

function project(id: string, cwd: string) {
  return { id: id as ProjectId, cwd, kind: "project" as const };
}

describe("resolveChatCreationTarget", () => {
  it("starts threads directly in Caide apps", () => {
    expect(
      resolveChatCreationTarget(project("p1", "/home/DejiTech/caide-apps/vento"), PATHS),
    ).toEqual({ kind: "thread", projectId: "p1" });
  });

  it("reroutes plain folders into the create-app dialog", () => {
    expect(
      resolveChatCreationTarget(project("p2", "/home/DejiTech/work/client-site"), PATHS),
    ).toEqual({ kind: "app-dialog", projectId: "p2" });
  });

  it("returns null without a project so callers keep their no-target fallback", () => {
    expect(resolveChatCreationTarget(null, PATHS)).toBeNull();
    expect(resolveChatCreationTarget(undefined, PATHS)).toBeNull();
  });
});
