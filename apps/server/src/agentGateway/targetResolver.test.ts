import { assert, describe, it } from "@effect/vitest";
import type { ModelSelection, ProviderKind, ProviderModelDescriptor } from "@caide/contracts";
import { Effect } from "effect";

import type { ProviderDiscoveryServiceShape } from "../provider/Services/ProviderDiscoveryService.ts";
import {
  AgentGatewayTargetError,
  agentGatewayTargetOptionGuidance,
  resolveAgentGatewayTarget,
} from "./targetResolver.ts";

const discovery = {
  listModels: ({ provider }: { provider: string }) =>
    Effect.succeed({
      source: "test",
      models:
        provider === "openai"
          ? [
              {
                slug: "gpt-5.6-terra",
                name: "GPT-5.6 Terra",
                supportedReasoningEfforts: [
                  { value: "low", label: "Low" },
                  { value: "high", label: "High" },
                ],
              },
            ]
          : [],
    }),
} as unknown as ProviderDiscoveryServiceShape;

function makeEffortDescriptor(slug: string, value: string): ProviderModelDescriptor {
  return {
    slug,
    name: slug,
    supportedReasoningEfforts: [{ value, label: value }],
  };
}

function makeVariantDescriptor(slug: string): ProviderModelDescriptor {
  return {
    slug,
    name: slug,
    optionDescriptors: [
      {
        id: "variant",
        label: "Variant",
        type: "select",
        options: [{ id: "high", label: "High" }],
      },
    ],
  };
}

describe("agent gateway target resolver", () => {
  it.effect("builds examples from the exact model restrictions and preserves option types", () =>
    Effect.gen(function* () {
      const codexCatalog = {
        provider: "openai" as const,
        defaultModel: "gpt-5.5",
        enabled: true,
        available: true,
        models: [
          {
            slug: "gpt-5.6-terra",
            name: "GPT-5.6 Terra",
            supportedReasoningEfforts: [
              { value: "low", label: "Low" },
              { value: "high", label: "High" },
            ],
          },
        ],
      };
      const codexGuidance = agentGatewayTargetOptionGuidance(codexCatalog);
      assert.deepEqual(codexGuidance.exampleTarget, {
        provider: "openai",
        model: "gpt-5.6-terra",
        options: { reasoningEffort: "low" },
      });
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({
          target: codexGuidance.exampleTarget!,
          discovery,
        }),
        codexGuidance.exampleTarget,
      );

      const antigravityGuidance = agentGatewayTargetOptionGuidance({
        provider: "google",
        defaultModel: "Gemini 3.5 Flash",
        enabled: true,
        available: true,
        models: [
          {
            slug: "Gemini 3.5 Flash",
            name: "Gemini 3.5 Flash",
            supportedReasoningEfforts: [
              { value: "low", label: "Low" },
              { value: "high", label: "High" },
            ],
          },
        ],
      });
      assert.deepEqual(antigravityGuidance.exampleTarget?.options, {
        reasoningEffort: "low",
      });
      const reasoningEffort = antigravityGuidance.providerOptions.find(
        (option) => option.key === "reasoningEffort",
      );
      assert.equal(reasoningEffort?.valueType, "string");
      assert.deepEqual(reasoningEffort?.allowedValues, []);
      assert.deepEqual(
        antigravityGuidance.optionsByModel["Gemini 3.5 Flash"]?.find(
          (option) => option.key === "reasoningEffort",
        )?.allowedValues,
        ["low", "high"],
      );
      const antigravityDiscovery = {
        listModels: () =>
          Effect.succeed({
            source: "test",
            models: [
              {
                slug: "Gemini 3.5 Flash",
                name: "Gemini 3.5 Flash",
                supportedReasoningEfforts: [
                  { value: "low", label: "Low" },
                  { value: "high", label: "High" },
                ],
              },
            ],
          }),
      } as unknown as ProviderDiscoveryServiceShape;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({
          target: antigravityGuidance.exampleTarget!,
          discovery: antigravityDiscovery,
        }),
        antigravityGuidance.exampleTarget,
      );
    }),
  );

  it.effect("accepts Terra Low as a canonical model plus option", () =>
    Effect.gen(function* () {
      const target = {
        provider: "openai" as const,
        model: "gpt-5.6-terra",
        options: { reasoningEffort: "low" },
      };
      assert.deepEqual(yield* resolveAgentGatewayTarget({ target, discovery }), target);
    }),
  );

  it.effect("rejects a guessed model slug before creation", () =>
    Effect.gen(function* () {
      const result = yield* resolveAgentGatewayTarget({
        target: { provider: "openai", model: "gpt-5.6-terra-low" },
        discovery,
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(result.code, "model_unavailable");
    }),
  );

  it.effect("rejects an unadvertised effort", () =>
    Effect.gen(function* () {
      const result = yield* resolveAgentGatewayTarget({
        target: {
          provider: "openai",
          model: "gpt-5.6-terra",
          options: { reasoningEffort: "ultra" },
        },
        discovery,
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(result.code, "model_option_unavailable");
    }),
  );

  it.effect("accepts the advertised OpenCode/Kilo agent key without accepting arbitrary keys", () =>
    Effect.gen(function* () {
      const optionDiscovery = {
        listModels: () =>
          Effect.succeed({
            source: "test",
            models: [
              {
                slug: "openai/gpt-5",
                name: "OpenAI GPT-5",
                optionDescriptors: [
                  {
                    id: "variant",
                    label: "Variant",
                    type: "select" as const,
                    options: [{ id: "high", label: "High" }],
                  },
                ],
              },
            ],
          }),
      } as unknown as ProviderDiscoveryServiceShape;
      const accepted = {
        provider: "openai" as const,
        model: "openai/gpt-5",
        options: { variant: "high" },
      } as unknown as ModelSelection;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: accepted, discovery: optionDiscovery }),
        accepted,
      );
      const explicitAgent = {
        provider: "openai" as const,
        model: "openai/gpt-5",
        options: { agent: "build" },
      } as unknown as ModelSelection;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: explicitAgent, discovery: optionDiscovery }),
        explicitAgent,
      );
      const kiloAgent = {
        provider: "openai" as const,
        model: "openai/gpt-5",
        options: { agent: "plan" },
      } as unknown as ModelSelection;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: kiloAgent, discovery: optionDiscovery }),
        kiloAgent,
      );
      const result = yield* resolveAgentGatewayTarget({
        target: {
          provider: "openai",
          model: "openai/gpt-5",
          options: { inventedOption: "invented-value" },
        } as unknown as ModelSelection,
        discovery: optionDiscovery,
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(result.code, "model_option_unavailable");

      const guidance = agentGatewayTargetOptionGuidance({
        provider: "openai",
        defaultModel: "opencode/big-pickle",
        enabled: true,
        available: true,
        models: (yield* optionDiscovery.listModels({ provider: "openai" })).models,
      });
      assert.deepEqual(guidance.alternativeOptionKeys, ["agent"]);
    }),
  );

  it.effect("validates every advertised provider option from the same guidance rules", () =>
    Effect.gen(function* () {
      const cases: ReadonlyArray<{
        readonly provider: ProviderKind;
        readonly descriptor: ProviderModelDescriptor;
        readonly optionKey: string;
        readonly acceptedValue: string;
        readonly rejectedValue: string;
      }> = [
        {
          provider: "openai",
          descriptor: makeEffortDescriptor("codex-model", "low"),
          optionKey: "reasoningEffort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeEffortDescriptor("cursor-model", "low"),
          optionKey: "reasoningEffort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeEffortDescriptor("grok-model", "low"),
          optionKey: "reasoningEffort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeEffortDescriptor("droid-model", "low"),
          optionKey: "reasoningEffort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "anthropic",
          descriptor: makeEffortDescriptor("claude-model", "low"),
          optionKey: "effort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeEffortDescriptor("pi-model", "low"),
          optionKey: "thinkingLevel",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "google",
          descriptor: makeEffortDescriptor("antigravity-model", "low"),
          optionKey: "reasoningEffort",
          acceptedValue: "low",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeVariantDescriptor("opencode-model"),
          optionKey: "variant",
          acceptedValue: "high",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeVariantDescriptor("opencode-model"),
          optionKey: "agent",
          acceptedValue: "build",
          rejectedValue: "",
        },
        {
          provider: "openai",
          descriptor: makeVariantDescriptor("kilo-model"),
          optionKey: "variant",
          acceptedValue: "high",
          rejectedValue: "invented",
        },
        {
          provider: "openai",
          descriptor: makeVariantDescriptor("kilo-model"),
          optionKey: "agent",
          acceptedValue: "plan",
          rejectedValue: "",
        },
      ];

      for (const provider of new Set(cases.map((entry) => entry.provider))) {
        const providerCases = cases.filter((entry) => entry.provider === provider);
        const descriptor = providerCases[0]!.descriptor;
        const guidance = agentGatewayTargetOptionGuidance({
          provider,
          defaultModel: descriptor.slug,
          enabled: true,
          available: true,
          models: [descriptor],
        });
        assert.deepEqual(
          guidance.providerOptions.map((rule) => rule.key).toSorted(),
          providerCases.map((entry) => entry.optionKey).toSorted(),
        );

        const providerDiscovery = {
          listModels: () => Effect.succeed({ source: "test", models: [descriptor] }),
        } as unknown as ProviderDiscoveryServiceShape;
        for (const entry of providerCases) {
          const accepted = {
            provider,
            model: descriptor.slug,
            options: { [entry.optionKey]: entry.acceptedValue },
          } as unknown as ModelSelection;
          assert.deepEqual(
            yield* resolveAgentGatewayTarget({ target: accepted, discovery: providerDiscovery }),
            accepted,
          );

          const rejected = yield* resolveAgentGatewayTarget({
            target: {
              provider,
              model: descriptor.slug,
              options: { [entry.optionKey]: entry.rejectedValue },
            } as unknown as ModelSelection,
            discovery: providerDiscovery,
          }).pipe(
            Effect.map(() => ({ code: "unexpected-success" })),
            Effect.catch((error) => Effect.succeed(error)),
          );
          assert.equal(rejected.code, "model_option_unavailable");
        }
      }
    }),
  );

  it.effect("uses registry rules for model capability and context-window options", () =>
    Effect.gen(function* () {
      const descriptor: ProviderModelDescriptor = {
        slug: "cursor-model",
        name: "Cursor model",
        supportedReasoningEfforts: [{ value: "low", label: "Low" }],
        supportsFastMode: true,
        supportsThinkingToggle: true,
        contextWindowOptions: [{ value: "wide", label: "Wide" }],
      };
      const capabilityDiscovery = {
        listModels: () => Effect.succeed({ source: "test", models: [descriptor] }),
      } as unknown as ProviderDiscoveryServiceShape;
      const accepted = {
        provider: "openai" as const,
        model: descriptor.slug,
        options: {
          reasoningEffort: "low",
          fastMode: true,
          thinking: true,
          contextWindow: "wide",
        },
      };
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: accepted, discovery: capabilityDiscovery }),
        accepted,
      );

      for (const options of [
        { fastMode: true },
        { thinking: true },
        { contextWindow: "invented" },
      ] as const) {
        const unavailableDescriptor = {
          ...descriptor,
          supportsFastMode: false,
          supportsThinkingToggle: false,
          contextWindowOptions: [],
        };
        const unavailableDiscovery = {
          listModels: () => Effect.succeed({ source: "test", models: [unavailableDescriptor] }),
        } as unknown as ProviderDiscoveryServiceShape;
        const result = yield* resolveAgentGatewayTarget({
          target: { provider: "openai", model: descriptor.slug, options },
          discovery: unavailableDiscovery,
        }).pipe(
          Effect.map(() => ({ code: "unexpected-success" })),
          Effect.catch((error) => Effect.succeed(error)),
        );
        assert.equal(result.code, "model_option_unavailable");
      }
    }),
  );

  it.effect("enforces a discovered agent allowlist while permitting undiscovered agent names", () =>
    Effect.gen(function* () {
      const descriptor: ProviderModelDescriptor = {
        ...makeVariantDescriptor("opencode-model"),
        optionDescriptors: [
          ...(makeVariantDescriptor("opencode-model").optionDescriptors ?? []),
          {
            id: "agent",
            label: "Agent",
            type: "select",
            options: [
              { id: "build", label: "Build" },
              { id: "plan", label: "Plan" },
            ],
          },
        ],
      };
      const restrictedDiscovery = {
        listModels: () => Effect.succeed({ source: "test", models: [descriptor] }),
      } as unknown as ProviderDiscoveryServiceShape;
      const restrictedGuidance = agentGatewayTargetOptionGuidance({
        provider: "openai",
        defaultModel: descriptor.slug,
        enabled: true,
        available: true,
        models: [descriptor],
      });
      assert.deepInclude(
        restrictedGuidance.optionsByModel[descriptor.slug]?.find(
          (option) => option.key === "agent",
        ),
        { allowedValues: ["build", "plan"], allowsCustomValue: false },
      );

      const accepted = {
        provider: "openai" as const,
        model: descriptor.slug,
        options: { agent: "build" },
      } as unknown as ModelSelection;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: accepted, discovery: restrictedDiscovery }),
        accepted,
      );

      const rejected = yield* resolveAgentGatewayTarget({
        target: { ...accepted, options: { agent: "invented" } } as unknown as ModelSelection,
        discovery: restrictedDiscovery,
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(rejected.code, "model_option_unavailable");

      const unrestrictedDiscovery = {
        listModels: () =>
          Effect.succeed({ source: "test", models: [makeVariantDescriptor("opencode-model")] }),
      } as unknown as ProviderDiscoveryServiceShape;
      const unrestrictedGuidance = agentGatewayTargetOptionGuidance({
        provider: "openai",
        defaultModel: "opencode-model",
        enabled: true,
        available: true,
        models: [makeVariantDescriptor("opencode-model")],
      });
      assert.deepInclude(
        unrestrictedGuidance.providerOptions.find((option) => option.key === "agent"),
        { allowedValues: [], allowsCustomValue: true },
      );
      const custom = { ...accepted, options: { agent: "custom-agent" } } as unknown as ModelSelection;
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({ target: custom, discovery: unrestrictedDiscovery }),
        custom,
      );
    }),
  );

  it.effect("fails closed before discovery when Caide disables a provider", () =>
    Effect.gen(function* () {
      let discoveryCalls = 0;
      const trackedDiscovery = {
        listModels: () => {
          discoveryCalls += 1;
          return Effect.succeed({ models: [], source: "test" });
        },
      } as unknown as ProviderDiscoveryServiceShape;
      const result = yield* resolveAgentGatewayTarget({
        target: { provider: "openai", model: "gpt-5.5" },
        discovery: trackedDiscovery,
        availability: { enabled: false },
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(result.code, "provider_unavailable");
      assert.equal(discoveryCalls, 0);
    }),
  );

  it.effect("rejects a known unavailable or unauthenticated provider", () =>
    Effect.gen(function* () {
      const result = yield* resolveAgentGatewayTarget({
        target: { provider: "openai", model: "gpt-5.5" },
        discovery,
        availability: {
          enabled: true,
          available: false,
          authStatus: "unauthenticated",
          message: "Codex is not authenticated.",
        },
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(result.code, "provider_unavailable");
      assert.instanceOf(result, AgentGatewayTargetError);
      if (!(result instanceof AgentGatewayTargetError)) return;
      assert.include(result.message, "not authenticated");
    }),
  );

  it.effect("allows only the configured default while model discovery is unavailable", () =>
    Effect.gen(function* () {
      const unavailableDiscovery = {
        listModels: () => Effect.fail(new Error("temporary discovery failure")),
      } as unknown as ProviderDiscoveryServiceShape;
      const defaultTarget = { provider: "openai" as const, model: "gpt-5.5" };
      assert.deepEqual(
        yield* resolveAgentGatewayTarget({
          target: defaultTarget,
          discovery: unavailableDiscovery,
          availability: { enabled: true, available: true, authStatus: "authenticated" },
        }),
        defaultTarget,
      );

      const customResult = yield* resolveAgentGatewayTarget({
        target: { provider: "openai", model: "gpt-5.6-terra" },
        discovery: unavailableDiscovery,
        availability: { enabled: true, available: true, authStatus: "authenticated" },
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(customResult.code, "model_unavailable");

      const invalidOption = yield* resolveAgentGatewayTarget({
        target: {
          provider: "openai",
          model: "gpt-5.5",
          options: { reasoningEffort: "invented" },
        },
        discovery: unavailableDiscovery,
        availability: { enabled: true, available: true, authStatus: "authenticated" },
      }).pipe(
        Effect.map(() => ({ code: "unexpected-success" })),
        Effect.catch((error) => Effect.succeed(error)),
      );
      assert.equal(invalidOption.code, "model_option_unavailable");
    }),
  );
});
