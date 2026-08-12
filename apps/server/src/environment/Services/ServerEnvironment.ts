import type { EnvironmentId, ExecutionEnvironmentDescriptor } from "@caide/contracts";
import { Effect, ServiceMap } from "effect";

export interface ServerEnvironmentShape {
  readonly getEnvironmentId: Effect.Effect<EnvironmentId>;
  readonly getDescriptor: Effect.Effect<ExecutionEnvironmentDescriptor>;
}

export class ServerEnvironment extends ServiceMap.Service<
  ServerEnvironment,
  ServerEnvironmentShape
>()("caide/environment/Services/ServerEnvironment") {}
