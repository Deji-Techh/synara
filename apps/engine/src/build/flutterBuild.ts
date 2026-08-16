// FILE: src/build/flutterBuild.ts
// Purpose: Long-running `flutter build apk|appbundle|ipa` jobs. A build is
// spawned as a detached child, logs a ring buffer (QualityGate/Release data),
// and exposes a small state handle the panes poll (build/state) the same way
// previews are polled. Signing is left to the generated flutter project's
// key.properties (M5 release-centre step) — this service only runs the build.
// Layer: Engine build service

import { randomUUID } from "node:crypto";
import path from "node:path";

import { spawnFlutterProcess } from "../tools/flutterCommand.ts";
import { safeFlutterEnvironment } from "../safeEnvironment.ts";

import {
  type BuildStatus,
  parseFlutterBuildOutputPath,
  type BuildTarget,
} from "./flutterBuildParse.ts";

const MAX_LOG_LINES = 500;

export interface FlutterBuildJob {
  readonly buildId: string;
  state: {
    status: BuildStatus;
    exitCode: number | null;
    outputPath: string | null;
    error: string | null;
  };
  /** Raw `flutter build` output, newest last. */
  readonly logs: readonly string[];
}

const builds = new Map<string, FlutterBuildJob>();

export interface StartFlutterBuildInput {
  readonly appDir: string;
  readonly target: BuildTarget;
  readonly channel?: "debug" | "profile" | "release";
}

export function startFlutterBuild(input: StartFlutterBuildInput): FlutterBuildJob {
  const buildId = randomUUID();
  const channel = input.channel ?? "release";
  const args = ["build", input.target, "--" + channel];
  const expectedArtifact = defaultBuildArtifactPath(input.appDir, input.target, channel);

  const logs: string[] = [];
  const job: FlutterBuildJob = {
    buildId,
    state: { status: "running", exitCode: null, outputPath: null, error: null },
    logs,
  };

  let child;
  try {
    const env: NodeJS.ProcessEnv = {
      ...safeFlutterEnvironment(),
      // Skeleton for v1 code signing config via environment variables
      // FLUTTER_BUILD_NAME: process.env.FLUTTER_BUILD_NAME,
      // FLUTTER_BUILD_NUMBER: process.env.FLUTTER_BUILD_NUMBER,
      // KEYSTORE_PASSWORD: process.env.KEYSTORE_PASSWORD,
      // KEY_PASSWORD: process.env.KEY_PASSWORD,
      // KEY_ALIAS: process.env.KEY_ALIAS,
      // KEYSTORE_FILE: process.env.KEYSTORE_FILE,
    };
    child = spawnFlutterProcess(args, input.appDir, { env });
  } catch (error) {
    job.state.status = "failed";
    job.state.error = error instanceof Error ? error.message : String(error);
    builds.set(buildId, job);
    return job;
  }

  const capture = (chunk: string): void => {
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line === "") {
        continue;
      }
      if (logs.length >= MAX_LOG_LINES) {
        logs.shift();
      }
      logs.push(line);
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  child.on("error", (error) => {
    job.state.status = "failed";
    job.state.exitCode = null;
    job.state.error = error.message;
  });
  child.on("close", (code) => {
    job.state.status = code === 0 ? "succeeded" : "failed";
    job.state.exitCode = code;
    if (code === 0) {
      job.state.outputPath = parseFlutterBuildOutputPath(job.logs, input.target, expectedArtifact);
    } else {
      job.state.error =
        job.logs.slice(-40).join("\n") || `flutter build ${input.target} exited with code ${code}`;
    }
  });

  builds.set(buildId, job);
  return job;
}

function defaultBuildArtifactPath(
  appDir: string,
  target: BuildTarget,
  channel: "debug" | "profile" | "release",
): string {
  switch (target) {
    case "apk":
      return path.join(appDir, "build", "app", "outputs", "flutter-apk", `app-${channel}.apk`);
    case "appbundle":
      return path.join(appDir, "build", "app", "outputs", "bundle", channel, `app-${channel}.aab`);
    case "ipa":
      return path.join(appDir, "build", "ios", "archive", "Runner.xcarchive");
  }
}

export function getFlutterBuildJob(buildId: string): FlutterBuildJob | null {
  return builds.get(buildId) ?? null;
}
