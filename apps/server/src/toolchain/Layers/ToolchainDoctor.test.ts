import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { ToolchainDoctor } from "../Services/ToolchainDoctor";
import { ToolchainDoctorLive } from "./ToolchainDoctor";

const testLayer = ToolchainDoctorLive;

describe("ToolchainDoctorLive", () => {
  it("returns one check per known tool with a classified status", async () => {
    const result = await Effect.gen(function* () {
      const doctor = yield* ToolchainDoctor;
      return yield* doctor.run;
    }).pipe(Effect.provide(testLayer), Effect.runPromise);

    expect(result.checks.length).toBeGreaterThanOrEqual(4);
    const ids = result.checks.map((check) => check.id);
    expect(ids).toEqual(expect.arrayContaining(["flutter", "dart", "node", "git"]));

    for (const check of result.checks) {
      expect(["ok", "missing", "error", "unknown"]).toContain(check.status);
      if (check.status === "ok") {
        expect(check.version).toBeTypeOf("string");
      }
    }
  });
});
