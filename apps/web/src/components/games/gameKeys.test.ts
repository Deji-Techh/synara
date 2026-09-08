// FILE: gameKeys.test.ts
// Purpose: Verify game keyboard guards never hijack editable surfaces.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { isEditableTarget, isInsideGameShell } from "./gameKeys";

describe("gameKeys guards", () => {
  it("treats inputs and editors as editable", () => {
    const input = document.createElement("input");
    expect(isEditableTarget(input)).toBe(true);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isEditableTarget(editable)).toBe(true);
  });

  it("ignores plain divs", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("detects game shell ownership", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-game-shell", "");
    const child = document.createElement("button");
    shell.appendChild(child);
    document.body.appendChild(shell);
    expect(isInsideGameShell(child)).toBe(true);
    expect(isInsideGameShell(document.createElement("div"))).toBe(false);
    shell.remove();
  });
});
