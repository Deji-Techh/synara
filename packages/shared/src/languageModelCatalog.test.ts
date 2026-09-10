import { describe, expect, it } from "vitest";
import { MODEL_OPTIONS, tasteForModelSlug } from "./languageModelCatalog";

describe("model taste scores (item 29)", () => {
  it("annotates benchmarked flagships in the static catalog", () => {
    const find = (provider: string, name: string) =>
      MODEL_OPTIONS[provider]?.find((m) => m.name === name)?.taste;
    expect(find("anthropic", "claude-opus-4-8")).toBe(8);
    expect(find("anthropic", "claude-sonnet-4-6")).toBe(7);
    expect(find("openai", "gpt-5.6-sol")).toBe(5);
  });

  it("resolves taste from discovery slugs, parameterized included", () => {
    expect(tasteForModelSlug("claude-opus-4-8")).toBe(8);
    expect(tasteForModelSlug("anthropic/claude-sonnet-4-6")).toBe(7);
    expect(tasteForModelSlug("gpt-5.6-sol[high]")).toBe(5);
    expect(tasteForModelSlug("  ")).toBeUndefined();
    expect(tasteForModelSlug("some-unknown-model")).toBeUndefined();
  });
});
