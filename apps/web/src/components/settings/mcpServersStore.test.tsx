// FILE: mcpServersStore.test.ts
// Purpose: Guards MCP server config validation + panel shell rendering.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpServersSettingsPanel } from "./McpServersSettingsPanel";
import { validateServer, type McpServerConfig } from "./mcpServersStore";

const base: McpServerConfig = {
  id: "mcp-1",
  name: "github",
  transport: "stdio",
  enabled: true,
  command: "npx",
  createdAt: 0,
};

describe("mcpServersStore", () => {
  it("accepts valid stdio/SSE configs", () => {
    expect(validateServer(base, [])).toEqual([]);
    expect(
      validateServer({ ...base, id: "x", name: "y", transport: "sse", url: "https://mcp.example/sse" }, [base]),
    ).toEqual([]);
  });

  it("rejects missing names, duplicates, and bad transports", () => {
    expect(validateServer({ ...base, name: " " }, [])).toContain("Name is required.");
    expect(validateServer({ ...base, id: "x", name: "GITHUB" }, [base])).toEqual([
      'Another server is already named "GITHUB".',
    ]);
    expect(validateServer({ ...base, command: "" }, [])).toContain(
      "Command is required for stdio servers (e.g. npx, uvx, node).",
    );
    expect(validateServer({ ...base, transport: "sse", url: "nope" }, [])).toContain(
      "A valid http(s) URL is required.",
    );
    expect(validateServer({ ...base, transport: "oauth", url: "https://x", authorizeUrl: "" }, [])).toContain(
      "Authorize URL is required for OAuth servers.",
    );
  });

  it("renders the panel shell without a backend", () => {
    const markup = renderToStaticMarkup(<McpServersSettingsPanel active={true} />);
    expect(markup).toContain("MCP servers");
    expect(markup).toContain("No MCP servers");
    expect(markup).toContain("Auto-approve safe MCP calls");
    expect(markup).toContain("/mcp");
    expect(renderToStaticMarkup(<McpServersSettingsPanel active={false} />)).toBe("");
  });
});
