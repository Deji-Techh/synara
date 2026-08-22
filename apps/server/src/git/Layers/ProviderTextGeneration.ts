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
      isAutomation: false,
      confidence: 0,
      language: null,
      name: "Automated task",
      taskPrompt: "",
      schedule: null,
      mode: "dedicated" as const,
      maxIterations: null,
      completionPolicy: { type: "none" as const },
      missingFields: [],
      needsConfirmation: false,
      reason: "not implemented",
    }),
  evaluateAutomationCompletion: () =>
    Effect.succeed({ stopMatched: false, confidence: 0, reason: "not implemented" }),
};

export const ProviderTextGenerationLive = Layer.succeed(TextGeneration, stubTextGeneration);
