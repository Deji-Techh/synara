import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolSet } from "ai";
import {
  isAnthropicProvider,
  withSystemCacheBreakpoint,
  withToolCacheBreakpoint,
} from "@/ipc/utils/cache_breakpoints";

describe("isAnthropicProvider", () => {
  it("returns true only for the anthropic provider", () => {
    expect(isAnthropicProvider("anthropic")).toBe(true);
    expect(isAnthropicProvider("openai")).toBe(false);
    expect(isAnthropicProvider("google")).toBe(false);
    expect(isAnthropicProvider(undefined)).toBe(false);
  });
});

describe("withSystemCacheBreakpoint", () => {
  it("wraps the system prompt in SystemModelMessage[] with an anthropic cache breakpoint", () => {
    const result = withSystemCacheBreakpoint("You are a helpful agent.", "anthropic");
    expect(result).toEqual([
      {
        role: "system",
        content: "You are a helpful agent.",
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
    ]);
  });

  it("returns the prompt unchanged for non-anthropic providers", () => {
    const prompt = "You are a helpful agent.";
    expect(withSystemCacheBreakpoint(prompt, "openai")).toBe(prompt);
    expect(withSystemCacheBreakpoint(prompt, undefined)).toBe(prompt);
  });

  it("returns undefined when the prompt is empty", () => {
    expect(withSystemCacheBreakpoint(undefined, "anthropic")).toBeUndefined();
    expect(withSystemCacheBreakpoint("", "anthropic")).toBe("");
  });
});

describe("withToolCacheBreakpoint", () => {
  const tools: ToolSet = {
    read_file: { description: "read", inputSchema: z.object({}) },
    write_file: { description: "write", inputSchema: z.object({}) },
    grep: { description: "grep", inputSchema: z.object({}) },
  };

  it("adds a cache breakpoint only to the last tool for anthropic", () => {
    const result = withToolCacheBreakpoint(tools, "anthropic");
    expect(Object.keys(result!)).toEqual(["read_file", "write_file", "grep"]);
    expect(result!.read_file.providerOptions).toBeUndefined();
    expect(result!.write_file.providerOptions).toBeUndefined();
    expect(result!.grep.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });

  it("does not mutate the original tool set", () => {
    const result = withToolCacheBreakpoint(tools, "anthropic");
    expect(tools.grep.providerOptions).toBeUndefined();
    expect(result!.grep).not.toBe(tools.grep);
    expect(result!.read_file).toBe(tools.read_file);
  });

  it("returns the tools unchanged for non-anthropic providers", () => {
    expect(withToolCacheBreakpoint(tools, "openai")).toBe(tools);
    expect(withToolCacheBreakpoint(tools, undefined)).toBe(tools);
  });

  it("returns undefined when tools are undefined", () => {
    expect(withToolCacheBreakpoint(undefined, "anthropic")).toBeUndefined();
  });

  it("returns empty tool set unchanged", () => {
    expect(withToolCacheBreakpoint({}, "anthropic")).toEqual({});
  });

  it("leaves the tool set unchanged when the last tool is a function", () => {
    const fnTools: Record<string, unknown> = {
      read_file: { description: "read", inputSchema: z.object({}) },
      dynamic: () => ({ description: "dynamic", inputSchema: z.object({}) }),
    };
    expect(withToolCacheBreakpoint(fnTools as ToolSet, "anthropic")).toBe(fnTools);
  });

  it("preserves existing providerOptions on the last tool", () => {
    const withExisting: ToolSet = {
      a: { description: "a", inputSchema: z.object({}) },
      b: {
        description: "b",
        inputSchema: z.object({}),
        providerOptions: { openai: { foo: "bar" } },
      },
    };
    const result = withToolCacheBreakpoint(withExisting, "anthropic");
    expect(result!.b.providerOptions).toEqual({
      openai: { foo: "bar" },
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });
});
