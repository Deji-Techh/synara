import { describe, expect, it } from "vitest";
import {
  deriveFriendlyCommandTarget,
  deriveInlineCommandCall,
  deriveReadableCommandDisplay,
  deriveReadableToolTitle,
  deriveCaideMcpToolTitle,
  extractWebFetchUrl,
  isInspectCommand,
  isCaideBrowserToolCall,
  normalizeCompactToolLabel,
  resolveCommandVisualKind,
  sanitizeCaideMcpToolPreview,
} from "./toolCallLabel";

describe("extractWebFetchUrl", () => {
  it("pulls the url out of a WebFetch argument summary", () => {
    expect(
      extractWebFetchUrl({
        toolName: "WebFetch",
        detail: 'WebFetch: {"url":"https://ui.shadcn.com/docs/components","prompt":"List EVER..."}',
      }),
    ).toBe("https://ui.shadcn.com/docs/components");
  });

  it("recognizes alternate fetch tool names and the uri field", () => {
    expect(
      extractWebFetchUrl({
        toolName: "web_fetch",
        detail: '{"uri":"https://example.com/path"}',
      }),
    ).toBe("https://example.com/path");
  });

  it("falls back to a bare URL token when there is no json field", () => {
    expect(extractWebFetchUrl({ toolName: "fetch", detail: "Fetching https://example.com." })).toBe(
      "https://example.com",
    );
  });

  it("ignores non-fetch tools", () => {
    expect(
      extractWebFetchUrl({ toolName: "Read", detail: '{"url":"https://example.com"}' }),
    ).toBeNull();
  });

  it("ignores non-http(s) and missing urls", () => {
    expect(
      extractWebFetchUrl({ toolName: "WebFetch", detail: '{"url":"ftp://example.com"}' }),
    ).toBeNull();
    expect(extractWebFetchUrl({ toolName: "WebFetch", detail: '{"prompt":"hi"}' })).toBeNull();
    expect(extractWebFetchUrl({ toolName: "WebFetch", detail: undefined })).toBeNull();
  });
});

describe("normalizeCompactToolLabel", () => {
  it("removes trailing completion wording", () => {
    expect(normalizeCompactToolLabel("Tool call completed")).toBe("Tool call");
    expect(normalizeCompactToolLabel("Ran command done")).toBe("Ran command");
    expect(normalizeCompactToolLabel("Ran command started")).toBe("Ran command");
  });
});

describe("deriveCaideMcpToolTitle", () => {
  it("uses stable action-first names for Caide browser tools", () => {
    for (const status of ["running", "completed", "failed"] as const) {
      expect(
        deriveCaideMcpToolTitle({
          toolName: "mcp__caide__browser_open",
          status,
        }),
      ).toBe("Open browser tab");
    }

    expect(
      deriveCaideMcpToolTitle({
        title: "Caide: Browser Snapshot",
        status: "completed",
      }),
    ).toBe("Snapshot browser page");
  });

  it("has intentional running and completed copy for every Caide gateway action", () => {
    const cases = [
      ["caide_context", "Caide is checking its context", "Caide checked its context"],
      [
        "caide_capabilities",
        "Caide is checking available agents",
        "Caide checked available agents",
      ],
      ["caide_list_projects", "Caide is listing projects", "Caide listed projects"],
      ["caide_list_threads", "Caide is listing threads", "Caide listed threads"],
      ["caide_read_thread", "Caide is reading a thread", "Caide read a thread"],
      [
        "caide_read_thread_activity",
        "Caide is reading thread activity",
        "Caide read thread activity",
      ],
      ["caide_read_thread_events", "Caide is reading thread events", "Caide read thread events"],
      [
        "caide_read_thread_runtime_events",
        "Caide is reading thread runtime events",
        "Caide read thread runtime events",
      ],
      ["caide_diagnose_thread", "Caide is diagnosing a thread", "Caide diagnosed a thread"],
      ["caide_create_thread", "Caide is creating a thread", "Caide created a thread"],
      ["caide_create_threads", "Caide is creating threads", "Caide created threads"],
      [
        "caide_wait_for_threads",
        "Caide is waiting for threads",
        "Caide finished waiting for threads",
      ],
      ["caide_send_message", "Caide is sending a message", "Caide sent a message"],
      ["caide_interrupt_thread", "Caide is interrupting a thread", "Caide interrupted a thread"],
      ["caide_set_thread_title", "Caide is renaming a thread", "Caide renamed a thread"],
      ["caide_set_thread_archived", "Caide is updating a thread", "Caide updated a thread"],
      ["caide_create_automation", "Caide is creating an automation", "Caide created an automation"],
      ["caide_list_automations", "Caide is listing automations", "Caide listed automations"],
      ["caide_cancel_automation", "Caide is stopping an automation", "Caide stopped an automation"],
      ["caide_overview", "Caide is gathering an overview", "Caide gathered an overview"],
      [
        "caide_list_allowed_projects",
        "Caide is listing allowed projects",
        "Caide listed allowed projects",
      ],
      ["caide_create_task", "Caide is creating a task", "Caide created a task"],
      ["caide_wait_for_task", "Caide is waiting for a task", "Caide finished waiting for a task"],
      ["caide_read_task", "Caide is reading a task", "Caide read a task"],
    ] as const;

    for (const [toolName, running, completed] of cases) {
      expect(deriveCaideMcpToolTitle({ toolName, status: "running" })).toBe(running);
      expect(deriveCaideMcpToolTitle({ toolName, status: "completed" })).toBe(completed);
    }

    expect(
      deriveCaideMcpToolTitle({
        toolName: "caide_create_threads",
        status: "failed",
      }),
    ).toBe("Caide couldn't create threads");
    expect(
      deriveCaideMcpToolTitle({
        toolName: "caide_create_thread",
        status: "cancelled",
      }),
    ).toBe("Caide stopped creating a thread");
  });

  it("turns provider-specific create-thread identifiers into activity sentences", () => {
    expect(
      deriveCaideMcpToolTitle({
        toolName: "Caide__caide_create_thread",
        status: "running",
      }),
    ).toBe("Caide is creating a thread");
    expect(
      deriveCaideMcpToolTitle({
        toolName: "mcp__caide__caide_create_thread",
        status: "completed",
      }),
    ).toBe("Caide created a thread");
  });

  it("recognizes bare and already-humanized Caide tool names", () => {
    expect(deriveCaideMcpToolTitle({ toolName: "caide_send_message", status: "running" })).toBe(
      "Caide is sending a message",
    );
    expect(
      deriveCaideMcpToolTitle({ title: "Caide: Caide List Threads", status: "completed" }),
    ).toBe("Caide listed threads");
  });

  it("ignores tools from other MCP servers", () => {
    expect(
      deriveCaideMcpToolTitle({
        toolName: "mcp__codex_apps__github_fetch_pr",
        status: "running",
      }),
    ).toBeNull();
  });

  it("keeps future Caide actions branded without exposing raw identifiers", () => {
    expect(
      deriveCaideMcpToolTitle({
        toolName: "mcp__caide__caide_delete_project",
        status: "running",
      }),
    ).toBe("Caide is handling delete project");
    expect(
      deriveCaideMcpToolTitle({
        toolName: "Caide__caide_delete_project",
        status: "completed",
      }),
    ).toBe("Caide handled delete project");
    expect(
      deriveCaideMcpToolTitle({
        toolName: "caide_is_handling_delete_project",
        status: "completed",
      }),
    ).toBe("Caide handled delete project");
  });

  it("does not reinterpret free text beginning with fallback status copy", () => {
    expect(
      deriveCaideMcpToolTitle({
        title: "Caide is handling delete project after recovery",
        status: "completed",
      }),
    ).toBeNull();
    expect(
      deriveCaideMcpToolTitle({
        title: "Caide handled delete project after recovery",
        status: "running",
      }),
    ).toBeNull();
    expect(
      deriveCaideMcpToolTitle({
        title: "Caide couldn't handle delete project after recovery",
        status: "failed",
      }),
    ).toBeNull();
  });

  it("leaves free-text activity summaries starting with Caide untouched", () => {
    expect(
      deriveCaideMcpToolTitle({
        title: "Caide recovered a stale running state",
        status: "completed",
      }),
    ).toBeNull();
    expect(
      deriveCaideMcpToolTitle({
        fallbackLabel: "Caide restarted the provider session",
        status: "running",
      }),
    ).toBeNull();
  });

  it("removes transport identifiers without hiding meaningful Caide details", () => {
    expect(
      sanitizeCaideMcpToolPreview({
        preview: "Caide__caide_create_threads",
        heading: "Caide created threads",
        status: "completed",
      }),
    ).toBeNull();
    expect(
      sanitizeCaideMcpToolPreview({
        preview: 'Unexpected key "reasoningEffort" for Claude Agent',
        heading: "Caide couldn't create threads",
        status: "failed",
      }),
    ).toBe('Unexpected key "reasoningEffort" for Claude Agent');
  });
});

describe("isCaideBrowserToolCall", () => {
  it("recognizes canonical presentation titles without a tool identifier", () => {
    expect(isCaideBrowserToolCall({ title: "Open browser tab" })).toBe(true);
    expect(isCaideBrowserToolCall({ fallbackLabel: "Snapshot browser page" })).toBe(true);
    expect(isCaideBrowserToolCall({ title: "Caide listed threads" })).toBe(false);
  });
});

describe("deriveReadableToolTitle", () => {
  it("humanizes search commands even when wrapped in shell -lc", () => {
    expect(
      deriveReadableToolTitle({
        title: "Ran command",
        fallbackLabel: "Ran command",
        itemType: "command_execution",
        requestKind: "command",
        command: `/bin/zsh -lc 'rg -n "tool call" apps/web/src'`,
      }),
    ).toBe("Searched");
  });

  it("humanizes file read commands", () => {
    expect(
      deriveReadableToolTitle({
        title: "Ran command",
        fallbackLabel: "Ran command",
        itemType: "command_execution",
        command: "sed -n '520,550p' apps/web/src/session-logic.ts",
      }),
    ).toBe("Read");
  });

  it("humanizes git status commands", () => {
    expect(
      deriveReadableToolTitle({
        title: "Ran command",
        fallbackLabel: "Ran command",
        itemType: "command_execution",
        command: "git status --short",
      }),
    ).toBe("Checked");
  });

  it("keeps explicit non-generic titles", () => {
    expect(
      deriveReadableToolTitle({
        title: "Bash",
        fallbackLabel: "Ran command",
        itemType: "command_execution",
        command: "echo hello",
      }),
    ).toBe("Bash");
  });

  it("extracts a descriptor from payload when the title is generic", () => {
    expect(
      deriveReadableToolTitle({
        title: "Tool call",
        fallbackLabel: "Tool call",
        itemType: "dynamic_tool_call",
        payload: {
          data: {
            item: {
              toolName: "mcp__xcodebuildmcp__list_sims",
            },
          },
        },
      }),
    ).toBe("Xcodebuildmcp: List Sims");
  });

  it("treats Cursor placeholder titles as generic", () => {
    expect(
      deriveReadableToolTitle({
        title: "Find",
        fallbackLabel: "Find",
        itemType: "dynamic_tool_call",
        payload: { data: { kind: "search" } },
      }),
    ).toBe("Search");

    expect(
      deriveReadableToolTitle({
        title: "Read File",
        fallbackLabel: "Read File",
        itemType: "dynamic_tool_call",
        payload: { data: { kind: "read" } },
      }),
    ).toBe("Read");
  });

  it("formats MCP identifiers into readable tool names", () => {
    expect(
      deriveReadableToolTitle({
        title: "MCP tool call",
        fallbackLabel: "MCP tool call",
        itemType: "mcp_tool_call",
        payload: {
          data: {
            toolName: "mcp__codex_apps__github_fetch_pr",
          },
        },
      }),
    ).toBe("Codex Apps: Github Fetch Pr");
  });

  it("formats structured MCP server/tool payloads into readable tool names", () => {
    expect(
      deriveReadableToolTitle({
        title: "MCP tool call",
        fallbackLabel: "MCP tool call",
        itemType: "mcp_tool_call",
        payload: {
          data: {
            item: {
              type: "mcpToolCall",
              server: "computer-use",
              tool: "get_app_state",
            },
          },
        },
      }),
    ).toBe("Computer Use: Get App State");
  });
});

describe("deriveReadableCommandDisplay", () => {
  it("extracts search targets without leaking the full shell wrapper inline", () => {
    expect(deriveReadableCommandDisplay(`/bin/zsh -lc 'rg -n "tool call" apps/web/src'`)).toEqual({
      verb: "Searched",
      target: "for tool call in web/src",
      fullCommand: `/bin/zsh -lc 'rg -n "tool call" apps/web/src'`,
    });
  });

  it("compacts file paths for read commands", () => {
    expect(
      deriveReadableCommandDisplay(
        "sed -n '520,550p' apps/web/src/components/chat/MessagesTimeline.tsx",
      ),
    ).toEqual({
      verb: "Read",
      target: "chat/MessagesTimeline.tsx",
      fullCommand: "sed -n '520,550p' apps/web/src/components/chat/MessagesTimeline.tsx",
    });
  });

  it("unwraps zsh shell wrappers around read commands", () => {
    expect(
      deriveReadableCommandDisplay(
        `/bin/zsh -lc "sed -n '240,520p' src/components/provider-card.tsx"`,
      ),
    ).toEqual({
      verb: "Read",
      target: "components/provider-card.tsx",
      fullCommand: `/bin/zsh -lc "sed -n '240,520p' src/components/provider-card.tsx"`,
    });
  });

  it("keeps quoted paths intact when shell wrappers include cd chaining", () => {
    expect(
      deriveReadableCommandDisplay(
        `zsh -lc "cd '/tmp/my app' && sed -n '1,260p' src/pages/overview.tsx"`,
      ),
    ).toEqual({
      verb: "Read",
      target: "pages/overview.tsx",
      fullCommand: `zsh -lc "cd '/tmp/my app' && sed -n '1,260p' src/pages/overview.tsx"`,
    });
  });

  it("does not discard real chained commands after a shell wrapper", () => {
    expect(
      deriveReadableCommandDisplay(
        `/bin/zsh -lc 'rm -f /tmp/test.log && bun run --cwd apps/server test'`,
      ),
    ).toEqual({
      verb: "Removed",
      target: "/tmp/test.log",
      fullCommand: `/bin/zsh -lc 'rm -f /tmp/test.log && bun run --cwd apps/server test'`,
    });
  });

  it("removes env and timeout wrappers from inline command summaries", () => {
    expect(
      deriveReadableCommandDisplay(
        "env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 timeout 180s bun run dev",
        true,
      ),
    ).toEqual({
      verb: "Running",
      target: "bun run dev",
      fullCommand: "env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 timeout 180s bun run dev",
    });
  });

  it("summarizes inline script commands without leaking the script body", () => {
    expect(
      deriveReadableCommandDisplay(`node -e "const fs = require('fs'); console.log(fs.cwd)"`, true),
    ).toEqual({
      verb: "Running",
      target: "node script",
      fullCommand: `node -e "const fs = require('fs'); console.log(fs.cwd)"`,
    });

    expect(deriveReadableCommandDisplay("python3 - <<'PY'\nprint('hi')\nPY", true)).toEqual({
      verb: "Running",
      target: "python script",
      fullCommand: "python3 - <<'PY'\nprint('hi')\nPY",
    });
  });

  it("humanizes current-directory searches without leaking placeholder dots", () => {
    expect(deriveReadableCommandDisplay(`rg -n "model(s)?" .`)).toEqual({
      verb: "Searched",
      target: "for model(s)? in current directory",
      fullCommand: `rg -n "model(s)?" .`,
    });
  });

  it("falls back to a directory summary when the search token is only punctuation", () => {
    expect(deriveReadableCommandDisplay(`rg -n . src/lib`)).toEqual({
      verb: "Searched",
      target: "in src/lib",
      fullCommand: `rg -n . src/lib`,
    });
  });
});

describe("deriveFriendlyCommandTarget", () => {
  it("uses a friendly shell name instead of leaking the full wrapper command", () => {
    expect(
      deriveFriendlyCommandTarget(
        '"C:\\Users\\Example\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "powershell -NoProfile -Command \\"1..8\\""',
      ),
    ).toBe("PowerShell");
  });

  it("reads as the object of the row's sentence", () => {
    expect(deriveFriendlyCommandTarget(`/bin/zsh -lc 'rg -n "tool call" apps/web/src'`)).toBe(
      "for tool call in web/src",
    );
  });

  it("keeps long targets short enough to sit inline", () => {
    const target = deriveFriendlyCommandTarget(`echo ${"a".repeat(200)}`);
    expect(target.length).toBeLessThanOrEqual(72);
    expect(target.endsWith("…")).toBe(true);
  });
});

describe("deriveInlineCommandCall", () => {
  it("shows the actual command call without the shell wrapper", () => {
    expect(deriveInlineCommandCall(`/bin/zsh -lc 'rg -n "tool call" apps/web/src'`)).toBe(
      `rg -n "tool call" apps/web/src`,
    );
  });
});

describe("isInspectCommand", () => {
  it("detects read-only inspection commands (read/search/find/list)", () => {
    expect(isInspectCommand("cat package.json")).toBe(true);
    expect(isInspectCommand("sed -n 1,40p src/app.ts")).toBe(true);
    expect(isInspectCommand("head -n 20 README.md")).toBe(true);
    expect(isInspectCommand(`rg -n "tool call" apps/web/src`)).toBe(true);
    expect(isInspectCommand("grep -R foo .")).toBe(true);
    expect(isInspectCommand("find . -name '*.ts'")).toBe(true);
    expect(isInspectCommand("ls -la src")).toBe(true);
    expect(isInspectCommand(`/bin/zsh -lc 'rg -n "x" src'`)).toBe(true);
  });

  it("does not treat mutating or executing commands as inspections", () => {
    expect(isInspectCommand("git status")).toBe(false);
    expect(isInspectCommand("node build.js")).toBe(false);
    expect(isInspectCommand("rm -rf dist")).toBe(false);
    expect(isInspectCommand("mkdir foo")).toBe(false);
  });
});

describe("resolveCommandVisualKind", () => {
  it("classifies git commands through shell and global-option wrappers", () => {
    expect(resolveCommandVisualKind("git status --short")).toBe("git");
    expect(resolveCommandVisualKind("git -C apps/web status --short")).toBe("git");
    expect(resolveCommandVisualKind(`/bin/zsh -lc "cd repo && git branch -vv"`)).toBe("git");
  });

  it("classifies GitHub CLI commands through env wrappers", () => {
    expect(resolveCommandVisualKind("gh pr view 274 --repo owner/repo")).toBe("github");
    expect(resolveCommandVisualKind("env -u GH_TOKEN gh pr status")).toBe("github");
    expect(resolveCommandVisualKind("hub pull-request -m test")).toBe("github");
  });

  it("keeps inspections and ordinary commands distinct", () => {
    expect(resolveCommandVisualKind(`rg -n "tool call" apps/web/src`)).toBe("inspect");
    expect(resolveCommandVisualKind("bun run build")).toBe("terminal");
  });
});
