import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { TextGeneration } from "../Services/TextGeneration.ts";
import { ProviderTextGenerationLive } from "./ProviderTextGeneration.ts";

describe("ProviderTextGenerationLive", () => {
  it("provides stub git text generation", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;
        return yield* textGeneration.generateCommitMessage({
          cwd: "/repo",
          branch: "main",
          stagedSummary: "M README.md",
          stagedPatch: "",
        });
      }).pipe(Effect.provide(ProviderTextGenerationLive)),
    );

    expect(result.subject).toBe("chore: update");
  });
});

