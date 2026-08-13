import type { ServerRunToolchainDoctorResult } from "@caide/contracts";
import { Effect, ServiceMap } from "effect";

export interface ToolchainDoctorShape {
  readonly run: Effect.Effect<ServerRunToolchainDoctorResult>;
}

export class ToolchainDoctor extends ServiceMap.Service<ToolchainDoctor, ToolchainDoctorShape>()(
  "caide/toolchain/Services/ToolchainDoctor",
) {}
