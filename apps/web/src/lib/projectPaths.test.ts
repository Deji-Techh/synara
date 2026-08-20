import { describe, expect, it } from "vitest";

import { expandProjectHomePath, joinProjectPath } from "./projectPaths";

describe("joinProjectPath", () => {
  it.each([
    ["/Users/test/Developer/", "openai", "/Users/test/Developer/codex"],
    ["/", "openai", "/codex"],
    ["C:\\Users\\test\\", "openai", "C:\\Users\\test\\codex"],
    ["C:\\", "openai", "C:\\codex"],
  ])("joins %s and %s", (parent, child, expected) => {
    expect(joinProjectPath(parent, child)).toBe(expected);
  });
});

describe("expandProjectHomePath", () => {
  it.each([
    ["~", "/Users/test", "/Users/test"],
    ["~/Developer", "/Users/test", "/Users/test/Developer"],
    ["~\\Developer", "C:\\Users\\test", "C:\\Users\\test\\Developer"],
    ["/srv/repos", "/Users/test", "/srv/repos"],
    ["~/Developer", null, "~/Developer"],
  ])("expands %s against %s", (value, homeDir, expected) => {
    expect(expandProjectHomePath(value, homeDir)).toBe(expected);
  });
});
