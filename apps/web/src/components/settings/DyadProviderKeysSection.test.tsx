// FILE: DyadProviderKeysSection.test.tsx
// Purpose: Guards the provider keys section shell (no backend needed).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DyadProviderKeysSection } from "./DyadProviderKeysSection";

describe("DyadProviderKeysSection", () => {
  it("renders all providers with save/test actions", () => {
    const markup = renderToStaticMarkup(<DyadProviderKeysSection />);
    expect(markup).toContain("Harness model providers");
    for (const id of ["openai", "anthropic", "ollama", "custom"]) {
      expect(markup).toContain(id);
    }
    expect(markup).toContain("Save");
    expect(markup).toContain("Test");
    expect(markup).toContain("chatgpt");
    expect(markup).toContain("OAuth");
  });
});
