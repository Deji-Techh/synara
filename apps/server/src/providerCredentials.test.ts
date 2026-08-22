import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  ProviderCredentials,
  resolveProviderApiKey,
  type ProviderCredentialsShape,
} from "./providerCredentials";

describe("resolveProviderApiKey", () => {
  it("reads ProviderCredentials from the Effect service context", async () => {
    const credentials: ProviderCredentialsShape = {
      getApiKey: () => Effect.succeed("secret"),
      replaceApiKey: () => Effect.void,
      isApiKeyConfigured: () => Effect.succeed(true),
    };

    const apiKey = await Effect.runPromise(
      resolveProviderApiKey("groq").pipe(
        Effect.provide(Layer.succeed(ProviderCredentials, credentials)),
      ),
    );

    expect(apiKey).toBe("secret");
  });
});
