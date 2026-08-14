// FILE: src/agent/tools/fuzzyMatch.test.ts
import { describe, expect, it } from "vitest";
import { applyFuzzyEdit, fuzzyLineMatch } from "./fuzzyMatch.ts";

describe("fuzzyMatch", () => {
  const original = `function add(a, b) {
  return a + b;
}

function sub(a, b) {
  return a - b;
}
`;

  it("finds exact match", () => {
    const target = `function sub(a, b) {\n  return a - b;\n}`;
    const match = fuzzyLineMatch(original, target);
    expect(match).not.toBeNull();
    expect(match!.score).toBe(1);
    expect(match!.startIndex).toBe(4);
  });

  it("finds fuzzy match with whitespace differences", () => {
    const target = `function sub(a, b){
return a - b;
}`;
    const match = fuzzyLineMatch(original, target);
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThan(0.9);
  });

  it("finds fuzzy match with minor typos", () => {
    const target = `function sub(a, b) {
  return a - c;
}`;
    const match = fuzzyLineMatch(original, target);
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThan(0.9);
  });

  it("rejects completely wrong content", () => {
    const target = `function multiply(a, b) {
  return a * b;
}`;
    const match = fuzzyLineMatch(original, target);
    expect(match).toBeNull();
  });

  it("applies fuzzy edit correctly", () => {
    const target = `function sub(a, b){
return a - b;
}`;
    const replacement = `function sub(a, b) {
  return a - b;
  // added comment
}`;
    const result = applyFuzzyEdit(original, target, replacement);
    expect(result).not.toBeNull();
    expect(result).toContain("// added comment");
    expect(result).toContain("function add(a, b)");
  });
});
