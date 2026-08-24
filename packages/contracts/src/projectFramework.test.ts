import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { PROJECT_FRAMEWORKS, ProjectFramework } from "./projectFramework";

describe("ProjectFramework", () => {
  it("accepts every supported immutable project framework", () => {
    const decode = Schema.decodeUnknownSync(ProjectFramework);

    expect(PROJECT_FRAMEWORKS.map((framework) => decode(framework))).toEqual([
      "blank",
      "react-native",
      "flutter",
      "website",
    ]);
  });

  it("rejects legacy template identifiers as framework identities", () => {
    const decode = Schema.decodeUnknownSync(ProjectFramework);

    expect(() => decode("counter")).toThrow();
    expect(() => decode("supabase")).toThrow();
  });
});
