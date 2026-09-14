// FILE: CaideToolCards.test.tsx
// Purpose: Guards the themed tool-card set: verb/target rendering, state
// pills, theme-variable accents (no fixed-hue regressions), lazy output.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaideClaudeToolCard } from "./CaideClaudeToolCard";
import { CaideWriteCard } from "./CaideWriteCard";
import { CaideGenericToolCard } from "./CaideGenericToolCard";

describe("CaideClaudeToolCard", () => {
  it("renders verb badge + target for known tools", () => {
    const markup = renderToStaticMarkup(
      <CaideClaudeToolCard
        toolName="read_file"
        attributes={{ path: "src/App.tsx" }}
        content=""
        state="complete"
      />,
    );
    expect(markup).toContain("Read");
    expect(markup).toContain("src/App.tsx");
    expect(markup).toContain("Done");
  });

  it("maps edit/delete/build tools to verbs with screen-reader state (no fixed hues)", () => {
    const edit = renderToStaticMarkup(
      <CaideClaudeToolCard
        toolName="search_replace"
        attributes={{ path: "a.ts" }}
        state="complete"
      />,
    );
    expect(edit).toContain("Edit");
    const del = renderToStaticMarkup(
      <CaideClaudeToolCard toolName="delete_file" attributes={{ path: "a.ts" }} state="error" />,
    );
    expect(del).toContain("Failed");
    // State is a screen-reader label now (status was color-only); the row
    // uses theme tokens, never fixed hex hues.
    expect(del).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("shows running state while streaming with output rendered", () => {
    const markup = renderToStaticMarkup(
      <CaideClaudeToolCard
        toolName="run_command"
        attributes={{ command: "bun run dev" }}
        content="starting…"
        state="running"
      />,
    );
    expect(markup).toContain("Running");
    expect(markup).toContain("Bash");
    // Output renders eagerly (collapsed behind the disclosure region).
    expect(markup).toContain("starting…");
  });
});

describe("CaideWriteCard", () => {
  it("renders file name, line count, and writing state", () => {
    const markup = renderToStaticMarkup(
      <CaideWriteCard
        path="src/pages/Index.tsx"
        description="Home page"
        content={"a\nb\nc"}
        state="pending"
      />,
    );
    expect(markup).toContain("Index.tsx");
    expect(markup).toContain("3 lines");
    expect(markup).toContain("Writing...");
    expect(markup).toContain("Home page");
  });
});

describe("CaideGenericToolCard", () => {
  it("delegates to the themed claude card", () => {
    const markup = renderToStaticMarkup(
      <CaideGenericToolCard
        toolName="caide-grep"
        attributes={{ pattern: "TODO" }}
        state="complete"
      />,
    );
    expect(markup).toContain("Search");
    expect(markup).toContain("TODO");
  });
});
