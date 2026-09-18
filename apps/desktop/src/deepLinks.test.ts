// FILE: deepLinks.test.ts
// Purpose: Deep-link routing (schemes, routes, argv extraction, queue).

import { describe, expect, it } from "vitest";
import { createDeepLinkQueue, deepLinksFromArgv, parseDeepLink } from "./deepLinks";

describe("deep links", () => {
  it("routes known links on both schemes", () => {
    expect(parseDeepLink("caide://neon-oauth-return?code=abc")).toEqual({
      type: "neon-oauth-return",
      query: { code: "abc" },
    });
    expect(parseDeepLink("dyad://supabase-oauth-return?code=x")).toEqual({
      type: "supabase-oauth-return",
      query: { code: "x" },
    });
    expect(parseDeepLink("caide://mcp-oauth-return?state=s")).toMatchObject({
      type: "mcp-oauth-return",
    });
    expect(parseDeepLink("caide://receive-project?token=t")).toEqual({
      type: "receive-project",
      token: "t",
    });
  });

  it("parses prefill payloads", () => {
    const data = encodeURIComponent(JSON.stringify({ name: "srv" }));
    expect(parseDeepLink(`caide://add-mcp-server?data=${data}`)).toEqual({
      type: "add-mcp-server",
      payload: { name: "srv" },
    });
    expect(parseDeepLink("caide://add-prompt")).toEqual({ type: "add-prompt", payload: {} });
  });

  it("never throws on unknown input", () => {
    expect(parseDeepLink("https://example.com")).toMatchObject({ type: "unknown" });
    expect(parseDeepLink("caide://dyad-pro-return?x=1")).toMatchObject({ type: "unknown" });
    expect(parseDeepLink("caide://receive-project")).toMatchObject({ type: "unknown" });
    expect(parseDeepLink("not a url")).toMatchObject({ type: "unknown" });
  });

  it("extracts links from argv", () => {
    expect(
      deepLinksFromArgv(["caide", "--x", "caide://add-prompt", "dyad://neon-oauth-return?a=b"]),
    ).toEqual(["caide://add-prompt", "dyad://neon-oauth-return?a=b"]);
  });

  it("queues links until drained", () => {
    const queue = createDeepLinkQueue();
    expect(queue.size()).toBe(0);
    queue.push("caide://add-prompt");
    queue.push("caide://receive-project?token=t");
    expect(queue.size()).toBe(2);
    const drained = queue.drain();
    expect(drained.map((d) => d.type)).toEqual(["add-prompt", "receive-project"]);
    expect(queue.size()).toBe(0);
  });
});
