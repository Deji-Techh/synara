const fs = require("fs");
const path = "apps/server/src/provider/Layers/EngineAdapter.test.ts";
let content = fs.readFileSync(path, "utf-8");

const mockRepo = `
import { ProjectionThreadRepository } from "../../persistence/Services/ProjectionThreads.ts";
import { Option } from "effect";

const MockProjectionThreadRepository = Layer.succeed(ProjectionThreadRepository, {
  upsert: () => Effect.succeed(undefined),
  getById: () => Effect.succeed(Option.none()),
} as any);
`;

if (!content.includes("MockProjectionThreadRepository")) {
  content = content.replace(
    'import { EngineAdapterLive } from "./EngineAdapter.ts";',
    mockRepo + '\nimport { EngineAdapterLive } from "./EngineAdapter.ts";',
  );

  // Now replace provideAdapter(
  content = content.replace(
    /provideAdapter\(\s*Effect.gen\(function\*\s*\(\)\s*\{/g,
    "provideAdapter(\nEffect.gen(function* () {",
  );

  // Actually, we can just replace Layer.provide(EngineAdapterLive) with Layer.provide(EngineAdapterLive.pipe(Layer.provide(MockProjectionThreadRepository)))
  // Let's see how EngineAdapterLive is provided.
}
fs.writeFileSync(path, content, "utf-8");
