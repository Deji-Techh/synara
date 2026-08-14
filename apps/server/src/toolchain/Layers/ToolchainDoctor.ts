import type { ToolchainCheck, ToolchainCheckStatus } from "@caide/contracts";
import { Effect, Layer } from "effect";

import { runProcess } from "../../processRunner";
import { ToolchainDoctor, type ToolchainDoctorShape } from "../Services/ToolchainDoctor";

const TOOLCHAIN_PROBE_TIMEOUT_MS = 30_000;

interface Probe {
  readonly id: ToolchainCheck["id"];
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

const PROBES: readonly Probe[] = [
  { id: "flutter", label: "Flutter SDK", command: "flutter", args: ["--version"] },
  { id: "dart", label: "Dart SDK", command: "dart", args: ["--version"] },
  { id: "node", label: "Node.js", command: "node", args: ["--version"] },
  { id: "git", label: "Git", command: "git", args: ["--version"] },
  { id: "xcode", label: "Xcode", command: "xcodebuild", args: ["-version"] },
  { id: "android", label: "Android SDK", command: "adb", args: ["--version"] },
];

function parseVersion(probe: Probe, output: string): string | null {
  const firstLine = output.split("\n").find((line) => line.trim().length > 0) ?? "";
  const trimmed = firstLine.trim();
  if (trimmed.length === 0) return null;

  switch (probe.id) {
    case "flutter": {
      const match = trimmed.match(/Flutter\s+([0-9][^\s]*)/);
      return match?.[1] ?? trimmed;
    }
    case "dart": {
      const match = trimmed.match(/Dart\s+([0-9][^\s]*)/);
      return match?.[1] ?? trimmed;
    }
    case "node": {
      return trimmed.replace(/^v/, "");
    }
    case "git": {
      const match = trimmed.match(/git version\s+([0-9][^\s]*)/);
      return match?.[1] ?? trimmed;
    }
    case "xcode": {
      const match = trimmed.match(/Xcode\s+([0-9.]+)/);
      return match?.[1] ?? trimmed;
    }
    case "android": {
      const match = trimmed.match(/Version\s+([0-9.]+)/);
      return match?.[1] ?? trimmed;
    }
    default:
      return trimmed;
  }
}

const probeCheck = (probe: Probe): Effect.Effect<ToolchainCheck, never, never> =>
  Effect.gen(function* () {
    let outcome: ToolchainCheckStatus = "unknown";
    let message: string | undefined;
    let version: string | null = null;

    try {
      const result = yield* Effect.promise(() =>
        runProcess(probe.command, probe.args, {
          timeoutMs: TOOLCHAIN_PROBE_TIMEOUT_MS,
          outputMode: "truncate",
        }).catch(() => ({
          stdout: "",
          stderr: "",
          code: null,
          signal: null,
          timedOut: true,
        })),
      );

      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code === 0 && output.trim().length > 0) {
        outcome = "ok";
        version = parseVersion(probe, output);
      } else if (result.timedOut) {
        outcome = "error";
        message = `${probe.command} timed out after ${TOOLCHAIN_PROBE_TIMEOUT_MS / 1000}s.`;
      } else {
        outcome = "error";
        message = `${probe.command} exited with code ${result.code ?? "unknown"}.`;
      }
    } catch {
      outcome = "missing";
      message = `Could not find ${probe.command} on PATH.`;
    }

    return {
      id: probe.id,
      label: probe.label,
      status: outcome,
      ...(version !== null ? { version } : {}),
      ...(message !== undefined ? { message } : {}),
    } satisfies ToolchainCheck;
  });

export const makeToolchainDoctor = Effect.fn(function* () {
  const run = Effect.gen(function* () {
    const checks = yield* Effect.all(PROBES.map(probeCheck), {
      concurrency: "unbounded",
    });
    return { checks };
  });

  return { run } satisfies ToolchainDoctorShape;
});

export const ToolchainDoctorLive = Layer.effect(ToolchainDoctor, makeToolchainDoctor());
