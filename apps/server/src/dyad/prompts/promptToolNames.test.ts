// FILE: promptToolNames.test.ts
// Purpose: Prompt↔registry consistency — assembled system prompts must never
// teach donor/legacy tool names that don't exist in the turn registry.
// Models obey the prompt over the schema list, so a single stale name
// (list_files, grep, ...) produces hallucinated calls that fail at runtime.

import { describe, expect, it } from "vitest";
import { constructSystemPrompt } from "./index.ts";

// Donor/legacy names with no registry definition. Matched backticked so
// prose mentions can't false-positive.
const FORBIDDEN_TOOL_NAMES = [
  "list_files",
  "view_file",
  "grep_search",
  "run_type_checks",
  "run_tests",
  "run_lint",
  "capture_screenshot",
  "add_dependency",
  "spawn_background_task",
];

const MODES = ["build", "ask", "plan", "local-agent"] as const;
const FRAMEWORKS = ["blank", "website", "react-native", "flutter"] as const;

describe("prompt↔registry tool-name consistency", () => {
  for (const chatMode of MODES) {
    for (const caideFramework of FRAMEWORKS) {
      it(`mentions no nonexistent tools (${chatMode}/${caideFramework})`, () => {
        const prompt = constructSystemPrompt({ chatMode, caideFramework } as any);
        for (const name of FORBIDDEN_TOOL_NAMES) {
          expect(prompt).not.toContain(`\`${name}\``);
        }
        // Bare `grep` (not grep_search/code path) must not appear as a tool.
        expect(prompt).not.toMatch(/`grep`/);
      });
    }
  }
});
