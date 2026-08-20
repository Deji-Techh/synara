import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import type { FlutterRunDevice } from "@/lib/schemas";
import {
  getManagedFlutterBin as getManagedFlutterBinStatic,
  getManagedFlutterSdkPath as getManagedFlutterSdkPathStatic,
  getManagedDartBin as getManagedDartBinStatic,
  ensureManagedFlutter as ensureManagedFlutterStatic,
} from "@/ipc/services/managed_flutter_toolchain_service";

const FLUTTER_BIN = "flutter";

function getManagedFlutterCandidates(): string[] {
  try {
    const bin = getManagedFlutterBinStatic();
    if (fs.existsSync(bin)) return [bin];
  } catch {}
  return [];
}

function findFlutterOnPath(): string | null {
  try {
    const resolved = execSync(process.platform === "win32" ? "where flutter" : "which flutter", {
      stdio: "pipe",
      timeout: 5_000,
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return resolved || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Flutter SDK binary. Prefers the SDK on PATH (or FLUTTER_ROOT),
 * then falls back to well-known install locations so runs work even when the
 * Electron app was launched without the dev PATH exported.
 */
export function getFlutterExecutable(): string {
  const fromEnv = process.env.FLUTTER_ROOT
    ? path.join(process.env.FLUTTER_ROOT, "bin", FLUTTER_BIN)
    : null;
  const managedCandidates = getManagedFlutterCandidates();
  const candidates = [
    fromEnv,
    ...managedCandidates,
    findFlutterOnPath(),
    path.join(os.homedir(), "development", "flutter", "bin", FLUTTER_BIN),
    path.join(os.homedir(), "flutter", "bin", FLUTTER_BIN),
    "/opt/flutter/bin/flutter",
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return FLUTTER_BIN;
}

export function isFlutterApp(appPath: string): boolean {
  try {
    const pubspecPath = path.join(appPath, "pubspec.yaml");
    if (!fs.existsSync(pubspecPath)) {
      return false;
    }
    return fs.readFileSync(pubspecPath, "utf8").includes("sdk: flutter");
  } catch {
    return false;
  }
}

function managedRootCandidate(): string | null {
  try {
    const sdkPath = getManagedFlutterSdkPathStatic();
    if (
      fs.existsSync(path.join(sdkPath, "bin", "flutter")) ||
      fs.existsSync(path.join(sdkPath, "bin", "flutter.exe"))
    ) {
      return sdkPath;
    }
  } catch {}
  return null;
}

function flutterRootCandidates(): string[] {
  const fromEnv = process.env.FLUTTER_ROOT ? [process.env.FLUTTER_ROOT] : [];
  const managed = managedRootCandidate();
  const onPath = findFlutterOnPath();
  const pathRoot =
    onPath && onPath.endsWith(path.join("bin", "flutter"))
      ? path.dirname(path.dirname(onPath))
      : null;
  const candidates = [
    ...fromEnv,
    managed,
    pathRoot,
    path.join(os.homedir(), "development", "flutter"),
    path.join(os.homedir(), "flutter"),
    "/opt/flutter",
  ].filter((p): p is string => !!p);
  return candidates;
}

/**
 * Resolve the Dart executable bundled with the Flutter SDK. Prefers the SDK
 * on PATH (or FLUTTER_ROOT), then falls back to well-known install locations.
 */
export function getDartExecutable(): string {
  try {
    const dartBin = getManagedDartBinStatic();
    if (fs.existsSync(dartBin)) return dartBin;
  } catch {}
  for (const root of flutterRootCandidates()) {
    const candidate = path.join(root, "bin", "cache", "dart-sdk", "bin", "dart");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return "dart";
}

export function hasFlutterBinary(): boolean {
  const bin = getFlutterExecutable();
  if (bin === "flutter" || bin === "flutter.exe") {
    // Bare name → check PATH probe
    const found = findFlutterOnPath();
    return found !== null;
  }
  try {
    return fs.existsSync(bin);
  } catch {
    return false;
  }
}

export type FlutterProgressCallback = (
  p: import("@/ipc/services/managed_flutter_toolchain_service").FlutterToolchainProgress,
) => void;

/**
 * Ensure a runnable Flutter SDK is available.
 * - Returns immediately if host or managed flutter exists.
 * - Otherwise auto-installs the managed SDK (download indicator via onProgress).
 */
export async function ensureFlutterSdkAvailable(
  onProgress?: FlutterProgressCallback,
  signal?: AbortSignal,
): Promise<string> {
  if (hasFlutterBinary()) return getFlutterExecutable();
  return ensureManagedFlutterStatic({ onProgress, signal });
}

export function getFlutterRunCommand(
  port: number,
  appPath: string,
  device: FlutterRunDevice = "web-server",
): string {
  const flutter = getFlutterExecutable();
  if (device !== "web-server") {
    // Native run on a connected emulator/simulator — no local URL to proxy,
    // output streams to the Console and the app is driven from the device.
    return `${flutter} pub get && ${flutter} run -d ${device}`;
  }
  const dartDefine = getDartDefineFromFileArgs(appPath);
  return `${flutter} pub get && ${flutter} run -d web-server --web-port ${port} --web-hostname localhost${dartDefine.length > 0 ? ` ${dartDefine.join(" ")}` : ""}`;
}

/**
 * `--dart-define-from-file` makes CAIDE's env workflow work in Flutter natively:
 * env vars auto-injected into `.env.local` by Neon/Supabase integrations are
 * compiled into the app and read via `String.fromEnvironment(...)`. No-op when
 * there is no `.env.local` (dotenv/JSON format accepted by the Flutter tool).
 */
export function getDartDefineFromFileArgs(appPath: string): string[] {
  try {
    if (fs.existsSync(path.join(appPath, ".env.local"))) {
      return ["--dart-define-from-file=.env.local"];
    }
  } catch {
    // ignore
  }
  return [];
}
