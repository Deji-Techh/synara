import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { spawnFlutterProcess } from "../tools/flutterCommand.ts";

const execFileAsync = promisify(execFile);

export interface IOSSimulator {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable: boolean;
}

interface SimctlDevice {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable: boolean | string;
}

export async function listSimulators(): Promise<IOSSimulator[]> {
  const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devices", "json"]);
  const data = JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> };
  const devices: IOSSimulator[] = [];
  
  for (const runtime of Object.keys(data.devices)) {
    for (const device of data.devices[runtime] ?? []) {
      devices.push({
        udid: device.udid,
        name: device.name,
        state: device.state,
        isAvailable: Boolean(device.isAvailable),
      });
    }
  }
  
  return devices;
}

export async function bootSimulator(id: string): Promise<void> {
  await execFileAsync("xcrun", ["simctl", "boot", id]);
}

export async function takeScreenshot(id: string, outputPath: string): Promise<void> {
  await execFileAsync("xcrun", ["simctl", "io", id, "screenshot", outputPath]);
}

export interface IosSimulatorPreviewOptions {
  readonly appDir: string;
  readonly deviceId: string;
  readonly flutterBinary?: string;
  readonly serveTimeoutMs?: number;
  readonly onLogLine?: (line: string) => void;
}

export interface IosSimulatorPreview {
  readonly logs: readonly string[];
  readonly exited: Promise<number | null>;
  stop(): Promise<void>;
  reload(hotReload: boolean): boolean;
}

const MAX_LOG_LINES = 500;

export class IosSimulatorPreviewError extends Error {}

export async function startIosSimulatorPreview(
  options: IosSimulatorPreviewOptions,
): Promise<IosSimulatorPreview> {
  const serveTimeoutMs = options.serveTimeoutMs ?? 120_000;

  let child: ChildProcess;
  try {
    child = spawnFlutterProcess(
      ["run", "-d", options.deviceId],
      options.appDir,
      { ...(options.flutterBinary !== undefined ? { binary: options.flutterBinary } : {}) },
    );
  } catch (error) {
    throw new IosSimulatorPreviewError(error instanceof Error ? error.message : String(error));
  }

  const logs: string[] = [];
  let exited: Promise<number | null> | null = null;

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
      options.onLogLine?.(line);
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  exited = new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
    child.on("error", () => resolve(null));
  });

  const handle = {
    logs,
    exited,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }
      if (child.stdin?.writable) {
        child.stdin.write("q\n");
      }
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    },
    reload(hotReload: boolean) {
      if (child.exitCode !== null || !child.stdin?.writable) {
        return false;
      }
      child.stdin.write(hotReload ? "r\n" : "R\n");
      return true;
    },
  } satisfies IosSimulatorPreview;

  return new Promise<IosSimulatorPreview>((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        child.kill("SIGKILL");
        reject(
          new IosSimulatorPreviewError(
            `flutter run on simulator timed out after ${serveTimeoutMs}ms; last output:\n${logs.slice(-20).join("\n")}`,
          ),
        );
      }
    }, serveTimeoutMs);

    const finishRejected = (message: string): void => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new IosSimulatorPreviewError(message));
      }
    };

    void exited.then((code) => {
      if (!resolved) {
        finishRejected(
          `flutter run exited with code ${code ?? "null"} before fully launching:\n${logs.slice(-20).join("\n")}`,
        );
      }
    });

    child.on("error", (error) => {
      if (!resolved) {
        finishRejected(`flutter run failed to start: ${error.message}`);
      }
    });

    const checkForSuccess = (): void => {
      if (resolved) {
        return;
      }
      for (const line of logs) {
        if (line.includes("To hot reload changes while running, press") || line.includes("Flutter run key commands")) {
          resolved = true;
          clearTimeout(timer);
          resolve(handle);
          return;
        }
      }
    };

    const originalCapture = capture;
    const checkWrappedCapture = (chunk: string): void => {
      originalCapture(chunk);
      checkForSuccess();
    };
    child.stdout?.off("data", capture);
    child.stderr?.off("data", capture);
    child.stdout?.on("data", checkWrappedCapture);
    child.stderr?.on("data", checkWrappedCapture);

    checkForSuccess();
  });
}
