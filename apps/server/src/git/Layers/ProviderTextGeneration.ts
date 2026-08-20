import { Effect, Layer } from "effect";

import { TextGeneration, type TextGenerationShape } from "../Services/TextGeneration.ts";

const stubTextGeneration: TextGenerationShape = {
  generateCommitMessage: () => Effect.succeed({ subject: "chore: update", body: "" }),
  generatePrContent: () => Effect.succeed({ title: "chore: update", body: "" }),
  generateDiffSummary: () => Effect.succeed({ summary: "" }),
  generateBranchName: () => Effect.succeed({ branch: "chore/update" }),
  generateThreadTitle: () => Effect.succeed({ title: "New thread" }),
  generateThreadRecap: () => Effect.succeed({ recap: "" }),
  generateAutomationIntent: () =>
    Effect.succeed({
      mode: "plan" as const,
      title: "Automated task",
      prompt: "",
      schedule: null,
    }),
  evaluateAutomationCompletion: () =>
    Effect.succeed({ completed: false, reason: "not implemented" }),
};

export const ProviderTextGenerationLive = Layer.succeed(TextGeneration, stubTextGeneration);
