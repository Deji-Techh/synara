import { describe, expect, it } from "vitest";

import {
  normalizeHarnessToolName,
  resolveHarnessToolPresentation,
} from "./harnessToolPresentation";

describe("resolveHarnessToolPresentation", () => {
  it("maps writes to edit type with write verbs", () => {
    expect(resolveHarnessToolPresentation("write_file")).toMatchObject({
      type: "edit",
      running: "Writing",
      completed: "Wrote",
    });
    expect(resolveHarnessToolPresentation("write_spec")?.type).toBe("edit");
  });

  it("maps reads to read type, never edit", () => {
    expect(resolveHarnessToolPresentation("read_file")?.type).toBe("read");
    expect(resolveHarnessToolPresentation("list_dir")).toMatchObject({
      type: "read",
      completed: "Listed",
    });
    expect(resolveHarnessToolPresentation("get_design_tokens")?.type).toBe("read");
  });

  it("maps build/install/lint to command type", () => {
    expect(resolveHarnessToolPresentation("build_project")).toMatchObject({
      type: "command",
      completed: "Built",
    });
    expect(resolveHarnessToolPresentation("install_package")?.completed).toBe("Installed");
    expect(resolveHarnessToolPresentation("lint_project")?.completed).toBe("Linted");
  });

  it("strips caide_/dyad_ prefixes and normalizes separators", () => {
    expect(normalizeHarnessToolName("caide_write_file")).toBe("write_file");
    expect(resolveHarnessToolPresentation("caide-write-file")?.type).toBe("edit");
    expect(resolveHarnessToolPresentation("dyad_list_dir")?.type).toBe("read");
  });

  it("returns null for unknown tools so keyword heuristics still apply", () => {
    expect(resolveHarnessToolPresentation("some_future_tool")).toBeNull();
    expect(resolveHarnessToolPresentation(null)).toBeNull();
  });

  it("maps update_todos to the other type with todo verbs", () => {
    expect(resolveHarnessToolPresentation("update_todos")).toMatchObject({
      type: "other",
      running: "Updating to-dos",
      completed: "Updated to-dos",
    });
  });
});
