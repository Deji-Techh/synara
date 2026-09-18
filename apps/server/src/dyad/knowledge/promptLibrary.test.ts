// FILE: promptLibrary.test.ts
// Purpose: Prompt CRUD + @prompt expansion (CAIDE_HOME-isolated).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createPrompt,
  deletePrompt,
  listPrompts,
  listPromptsForApp,
  replacePromptReference,
  updatePrompt,
} from "./promptLibrary.ts";

beforeEach(() => {
  process.env.CAIDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "caide-prompts-"));
});

describe("prompt library", () => {
  it("creates, lists, updates, and deletes prompts", async () => {
    const created = await createPrompt({ title: "Review", content: "Review this code." });
    expect(created.id).toBe(1);
    expect(await listPrompts()).toHaveLength(1);
    const updated = await updatePrompt(created.id, { description: "d", slug: "review" });
    expect(updated).toMatchObject({ description: "d", slug: "review" });
    await expect(updatePrompt(created.id, { slug: "bad slug!" })).rejects.toThrow(/Slug/);
    await expect(createPrompt({ title: "  ", content: "x" })).rejects.toThrow(/required/);
    await deletePrompt(created.id);
    expect(await listPrompts()).toHaveLength(0);
    await expect(deletePrompt(99)).rejects.toThrow(/not found/);
  });

  it("scopes listings by app", async () => {
    await createPrompt({ title: "A", content: "a", appPaths: ["/work/one"] });
    await createPrompt({ title: "B", content: "b" });
    expect((await listPromptsForApp("/work/one")).map((p) => p.title)).toEqual(["A"]);
    expect(await listPromptsForApp("/work/two")).toEqual([]);
  });

  it("expands @prompt references, passing unknowns through", () => {
    expect(replacePromptReference("use @prompt:3 now", { 3: "THE PROMPT" })).toBe(
      "use THE PROMPT now",
    );
    expect(replacePromptReference("use @prompt:9 now", {})).toBe("use @prompt:9 now");
    expect(replacePromptReference("", {})).toBe("");
  });
});
