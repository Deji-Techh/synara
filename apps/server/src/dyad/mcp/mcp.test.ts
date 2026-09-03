// FILE: mcp.test.ts
// Purpose: M2b gate — MCP keys, BM25 ranking, discovery tools, consent
// round-trip, classifier prompt shape.

import { describe, expect, it } from "vitest";
import { bm25Ranker, tokenize } from "./bm25.ts";
import {
  buildMcpConsentSystemPrompt,
  MCP_CONSENT_POLICY,
  MCP_CONSENT_SCAFFOLD,
} from "./mcpConsentPolicy.ts";
import {
  clearPendingMcpConsentsForSession,
  getMcpConsent,
  MemoryMcpConsentStore,
  requireMcpToolConsent,
} from "./mcpConsent.ts";
import {
  buildMcpToolKey,
  parseMcpToolKey,
  sanitizeMcpName,
} from "./mcpKeys.ts";
import {
  ALL_MCP_TOOLS,
  executeGetMcpToolSchema,
  executeSearchMcpTools,
  getMcpToolSchemaTool,
  searchMcpToolsTool,
  setMcpToolRegistry,
  type McpToolDef,
} from "./mcpTools.ts";

const DEFS: McpToolDef[] = [
  {
    jsName: "github__issue_write",
    toolKey: "github__issue_write",
    serverId: 1,
    serverName: "github",
    toolName: "issue_write",
    description: "Create a GitHub issue in a repository",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "Issue title" },
      },
      required: ["repo", "title"],
    },
  },
  {
    jsName: "slack__send_message",
    toolKey: "slack__send_message",
    serverId: 2,
    serverName: "slack",
    toolName: "send_message",
    description: "Send a Slack message to a channel",
    inputSchema: { type: "object", properties: { channel: { type: "string" } } },
  },
  {
    jsName: "github__pr_list",
    toolKey: "github__pr_list",
    serverId: 1,
    serverName: "github",
    toolName: "pr_list",
    description: "List pull requests for a repository",
    inputSchema: { type: "object", properties: { repo: { type: "string" } } },
  },
];

describe("dyad mcp transplant (m2b)", () => {
  it("parses/builds/sanitizes tool keys like the donor", () => {
    expect(parseMcpToolKey("my-server__my-tool")).toEqual({ serverName: "my-server", toolName: "my-tool" });
    expect(parseMcpToolKey("bare")).toEqual({ serverName: "", toolName: "bare" });
    expect(buildMcpToolKey("github", "issue_write")).toBe("github__issue_write");
    expect(sanitizeMcpName("My Server v2!")).toBe("My-Server-v2-");
    expect(ALL_MCP_TOOLS.map((t) => t.name)).toEqual(["search_mcp_tools", "get_mcp_tool_schema"]);
    expect(searchMcpToolsTool.presentCall?.({ query: "issue" })).toBe('Search MCP tools for "issue"');
    expect(getMcpToolSchemaTool.presentCall?.({ tools: ["a", "b"] })).toBe(
      "Get schema for MCP tool(s): a, b",
    );
  });

  it("ranks tools by keyword with BM25 (donor behavior)", () => {
    expect(tokenize("createIssue")).toContain("issue");
    expect(tokenize("repositories")).toContain("repository");
    const ranked = bm25Ranker("create github issue", DEFS);
    expect(ranked[0].def.toolKey).toBe("github__issue_write");
    expect(bm25Ranker("slack message", DEFS)[0].def.toolKey).toBe("slack__send_message");
    expect(bm25Ranker("zzz-no-match", DEFS)).toEqual([]);
    expect(bm25Ranker("", DEFS)).toEqual([]);
  });

  it("searches with server scoping, top-5 cap, and donor empty states", () => {
    setMcpToolRegistry({ listTools: () => DEFS });
    try {
      const hit = executeSearchMcpTools({ query: "github issue" });
      expect(hit).toContain("Top 2 MCP tool(s)");
      expect(hit).toContain("declare function github__issue_write");
      const scoped = executeSearchMcpTools({ query: "message", server: "slack" });
      expect(scoped).toContain("slack__send_message");
      expect(executeSearchMcpTools({ query: "x", server: "nope" })).toMatch(
        /No MCP server named "nope". Available servers: github, slack\./,
      );
      expect(executeSearchMcpTools({ query: "zzz-no-match" })).toMatch(/No MCP tools matched/);
    } finally {
      setMcpToolRegistry(null);
    }
    expect(executeSearchMcpTools({ query: "issue" })).toBe(
      "MCP tools are temporarily unavailable. Try again.",
    );
  });

  it("fetches signatures by name with missing-name notes", () => {
    setMcpToolRegistry({ listTools: () => DEFS });
    try {
      const out = executeGetMcpToolSchema({ tools: ["github__issue_write", "nope__x"] });
      expect(out).toContain("Signature(s) for 1 MCP tool(s)");
      expect(out).toContain("repo: string");
      expect(out).toContain("// No match for: nope__x");
      expect(executeGetMcpToolSchema({ tools: ["nope__x"] })).toMatch(/No MCP tool matched/);
    } finally {
      setMcpToolRegistry(null);
    }
  });

  it("runs the MCP consent round-trip: always, denied, classifier, ask, cancel", async () => {
    const store = new MemoryMcpConsentStore();
    store.set(1, "issue_write", "always");
    await expect(
      requireMcpToolConsent({
        sessionId: "s",
        serverId: 1,
        serverName: "github",
        toolName: "issue_write",
        store,
        requestConsent: async () => {
          throw new Error("must not be called");
        },
      }),
    ).resolves.toEqual({ allowed: true });

    store.set(2, "send_message", "denied");
    await expect(
      requireMcpToolConsent({
        sessionId: "s",
        serverId: 2,
        serverName: "slack",
        toolName: "send_message",
        store,
        requestConsent: async () => "accept-once",
      }),
    ).resolves.toEqual({ allowed: false });

    await expect(
      requireMcpToolConsent({
        sessionId: "s",
        serverId: 3,
        serverName: "db",
        toolName: "create_database",
        autoApproved: { approved: true, reason: "Creates a database you just asked for." },
        store,
        requestConsent: async () => "decline",
      }),
    ).resolves.toEqual({ allowed: true, autoApproveReason: "Creates a database you just asked for." });

    const viaResolve = requireMcpToolConsent({
      sessionId: "s2",
      serverId: 1,
      serverName: "github",
      toolName: "pr_list",
      store,
      requestConsent: async () => "accept-always",
    });
    await expect(viaResolve).resolves.toEqual({ allowed: true });
    expect(getMcpConsent(1, "pr_list", store)).toBe("always");

    const hanging = requireMcpToolConsent({
      sessionId: "s9",
      serverId: 1,
      serverName: "github",
      toolName: "pr_list",
      store: new MemoryMcpConsentStore(),
      requestConsent: () => new Promise<never>(() => {}),
    });
    clearPendingMcpConsentsForSession("s9");
    await expect(hanging).resolves.toEqual({ allowed: false });
  });

  it("ships the classifier prompt with allow/ask doctrine", () => {
    expect(MCP_CONSENT_SCAFFOLD).toMatch(/untrusted DATA/);
    expect(MCP_CONSENT_POLICY).toMatch(/Always ask/);
    expect(buildMcpConsentSystemPrompt()).toContain('"decision": "allow" | "ask"');
  });
});
