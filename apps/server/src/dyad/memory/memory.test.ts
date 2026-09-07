// FILE: memory.test.ts
// Purpose: APP_MEMORY.md round-trip (template creation, sections, bounds)
// + decisions inclusion + prompt formatting.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendMemoryNote,
  formatMemoryForPrompt,
  parseMemoryMarkdown,
  readAppMemory,
} from "./memory.ts";

function appDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-mem-"));
}

describe("project memory", () => {
  it("starts empty and formats nothing", () => {
    expect(readAppMemory(appDir())).toEqual([]);
    expect(formatMemoryForPrompt([])).toBe("");
  });

  it("appends notes into sections, creating the file", async () => {
    const dir = appDir();
    await appendMemoryNote(dir, "Standing notes", "Always use bun, never npm");
    await appendMemoryNote(dir, "Gotchas", "Expo web needs a clean cache after native edits");
    const notes = readAppMemory(dir);
    expect(notes).toHaveLength(2);
    const block = formatMemoryForPrompt(notes);
    expect(block).toContain("<app_memory>");
    expect(block).toContain("Always use bun");
    expect(block).toContain("Expo web needs");
    // Template comments are not parsed as notes.
    expect(parseMemoryMarkdown("## X\n<!-- hi -->\n- real\n")).toEqual([
      { section: "X", text: "real" },
    ]);
  });

  it("rejects empty notes and includes recent decisions", async () => {
    const dir = appDir();
    await expect(appendMemoryNote(dir, "Standing notes", "   ")).rejects.toThrow();
    fs.mkdirSync(path.join(dir, ".caide"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".caide", "decisions.jsonl"),
      JSON.stringify({ time: 1, decision: "Use Postgres", reason: "scale" }) + "\nnot-json\n",
    );
    const notes = readAppMemory(dir);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain("Use Postgres");
  });
});
