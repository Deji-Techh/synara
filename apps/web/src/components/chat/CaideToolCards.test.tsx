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
      <CaideClaudeToolCard toolName="read_file" attributes={{ path: "src/App.tsx" }} content="" state="complete" />,
    );
    expect(markup).toContain("Read");
    expect(markup).toContain("src/App.tsx");
    expect(markup).toContain("Done");
  });

  it("maps edit/delete/build tools to success/danger/warning accents via theme vars", () => {
    const edit = renderToStaticMarkup(
      <CaideClaudeToolCard toolName="search_replace" attributes={{ path: "a.ts" }} state="complete" />,
    );
    expect(edit).toContain("Edit");
    const del = renderToStaticMarkup(
      <CaideClaudeToolCard toolName="delete_file" attributes={{ path: "a.ts" }} state="error" />,
    );
    expect(del).toContain("Failed");
    // Accent rails resolve to theme variables, never fixed hex hues.
    expect(del).toContain("var(--destructive)");
    expect(del).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("shows running pill while streaming and keeps output collapsed", () => {
    const markup = renderToStaticMarkup(
      <CaideClaudeToolCard toolName="run_command" attributes={{ command: "bun run dev" }} content="starting…" state="running" />,
    );
    expect(markup).toContain("Running");
    expect(markup).toContain("Bash");
    // Lazy mount: output only renders after first expansion.
    expect(markup).not.toContain("starting…");
  });
});

describe("CaideWriteCard", () => {
  it("renders file name, line count, and writing state", () => {
    const markup = renderToStaticMarkup(
      <CaideWriteCard path="src/pages/Index.tsx" description="Home page" content={"a\nb\nc"} state="pending" />,
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
      <CaideGenericToolCard toolName="caide-grep" attributes={{ pattern: "TODO" }} state="complete" />,
    );
    expect(markup).toContain("Search");
    expect(markup).toContain("TODO");
  });
});
