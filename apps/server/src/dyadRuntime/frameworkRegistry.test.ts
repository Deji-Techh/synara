import { describe, expect, it } from "vitest";

import {
  frameworkSupports,
  getProjectFrameworkDefinition,
  projectFrameworkRegistry,
} from "./frameworkRegistry";

describe("projectFrameworkRegistry", () => {
  it("contains the four fixed project frameworks", () => {
    expect([...projectFrameworkRegistry.keys()]).toEqual([
      "blank",
      "react-native",
      "flutter",
      "website",
    ]);
  });

  it("keeps framework-specific build capabilities separate", () => {
    expect(frameworkSupports("blank", "preview")).toBe(false);
    expect(frameworkSupports("flutter", "build:android")).toBe(true);
    expect(frameworkSupports("react-native", "build:ios")).toBe(true);
    expect(frameworkSupports("website", "build:web")).toBe(true);
    expect(frameworkSupports("website", "build:android")).toBe(false);
  });

  it("uses stable framework IDs as icon keys", () => {
    expect(getProjectFrameworkDefinition("flutter").icon).toBe("flutter");
  });
});
