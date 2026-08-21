import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { app as electronApp } from "electron";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { safeArchiveEntryPath } from "./managed_android_toolchain_helpers";

const FLUTTER_PINNED_VERSION = "3.24.5";
const FLUTTER_MANAGED_VERSION = "2026.08.1";
const DOWNLOAD_TIMEOUT_MS = 45 * 60 * 1000;
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;

interface FlutterArtifact {
  fileName: string;
  url: string;
  sizeBytes: number;
  sha256?: string | null;
  kind: "zip" | "tar.xz";
}

const FLUTTER_ARTIFACTS: Record<string, FlutterArtifact> = {
  "win32-x64": {
    fileName: `flutter_windows_${FLUTTER_PINNED_VERSION}-stable.zip`,
    url: `https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_${FLUTTER_PINNED_VERSION}-stable.zip`,
    sizeBytes: 700_000_000,
    kind: "zip",
  },
  "linux-x64": {
    fileName: `flutter_linux_${FLUTTER_PINNED_VERSION}-stable.tar.xz`,
    url: `https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_PINNED_VERSION}-stable.tar.xz`,
    sizeBytes: 650_000_000,
    kind: "tar.xz",
  },
  "linux-arm64": {
    fileName: `flutter_linux_arm64_${FLUTTER_PINNED_VERSION}-stable.tar.xz`,
    url: `https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_arm64_${FLUTTER_PINNED_VERSION}-stable.tar.xz`,
    sizeBytes: 650_000_000,
    kind: "tar.xz",
  },
  "darwin-x64": {
    fileName: `flutter_macos_${FLUTTER_PINNED_VERSION}-stable.zip`,
    url: `https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_${FLUTTER_PINNED_VERSION}-stable.zip`,
    sizeBytes: 750_000_000,
    kind: "zip",
  },
  "darwin-arm64": {
    fileName: `flutter_macos_arm64_${FLUTTER_PINNED_VERSION}-stable.zip`,
    url: `https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_arm64_${FLUTTER_PINNED_VERSION}-stable.zip`,
    sizeBytes: 750_000_000,
    kind: "zip",
  },
};

export interface FlutterToolchainStatus {
  supported: boolean;
  installed: boolean;
  version: string;
  root: string;
  sdkPath: string;
  flutterBin: string;
  dartBin: string;
  estimatedDownloadBytes: number;
  unsupportedReason: string | null;
}

export interface FlutterToolchainProgress {
  phase: "preparing" | "download-flutter" | "extract-flutter" | "verifying" | "done";
  percent: number;
  componentPercent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  message: string;
}

type ProgressCallback = (progress: FlutterToolchainProgress) => void;

let activeInstall: Promise<FlutterToolchainStatus> | null = null;

/**
 * Newest progress emission from the running (or just-finished) install, so
 * status polls can report real progress without a push channel. Cleared when
 * a new install starts.
 */
let lastInstallProgress: FlutterToolchainProgress | null = null;

/** Latest install progress emission, or null when none is in flight. */
export function getLastManagedFlutterInstallProgress(): FlutterToolchainProgress | null {
  return lastInstallProgress;
}

function executableName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

export function getManagedFlutterRoot(): string {
  return path.join(
    electronApp.getPath("userData"),
    "toolchains",
    `flutter-${FLUTTER_MANAGED_VERSION}`,
  );
}

export function getManagedFlutterSdkPath(): string {
  return path.join(getManagedFlutterRoot(), "flutter");
}

export function getManagedFlutterBin(): string {
  return path.join(getManagedFlutterSdkPath(), "bin", executableName("flutter"));
}

export function getManagedDartBin(): string {
  return path.join(
    getManagedFlutterSdkPath(),
    "bin",
    "cache",
    "dart-sdk",
    "bin",
    executableName("dart"),
  );
}

function isSupportedHost(): boolean {
  const plat = process.platform;
  const archOk = process.arch === "x64" || process.arch === "arm64";
  return (plat === "win32" || plat === "linux" || plat === "darwin") && archOk;
}

function resolveArtifact(): FlutterArtifact | null {
  const key = `${process.platform}-${process.arch}`;
  if (FLUTTER_ARTIFACTS[key]) return FLUTTER_ARTIFACTS[key];
  // Fallbacks: darwin arm64→x64, linux arm64→x64
  if (process.platform === "darwin" && process.arch === "arm64") {
    return FLUTTER_ARTIFACTS["darwin-arm64"] ?? FLUTTER_ARTIFACTS["darwin-x64"] ?? null;
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return FLUTTER_ARTIFACTS["linux-arm64"] ?? FLUTTER_ARTIFACTS["linux-x64"] ?? null;
  }
  if (process.platform === "win32") return FLUTTER_ARTIFACTS["win32-x64"] ?? null;
  return null;
}

function flutterSdkReady(): boolean {
  return fs.existsSync(getManagedFlutterBin());
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CaideError(
      "Flutter toolchain installation was cancelled.",
      CaideErrorKind.UserCancelled,
    );
  }
}

function emit(onProgress: ProgressCallback | undefined, progress: FlutterToolchainProgress): void {
  lastInstallProgress = progress;
  onProgress?.(progress);
}

export async function inspectManagedFlutterToolchain(): Promise<FlutterToolchainStatus> {
  const supported = isSupportedHost();
  const installed = flutterSdkReady();
  const artifact = supported ? resolveArtifact() : null;
  const root = getManagedFlutterRoot();
  const sdkPath = getManagedFlutterSdkPath();
  return {
    supported,
    installed,
    version: FLUTTER_PINNED_VERSION,
    root,
    sdkPath,
    flutterBin: getManagedFlutterBin(),
    dartBin: getManagedDartBin(),
    estimatedDownloadBytes: installed ? 0 : (artifact?.sizeBytes ?? 700_000_000),
    unsupportedReason: supported
      ? null
      : "Flutter managed toolchain requires 64-bit Windows, macOS, or Linux.",
  };
}

export function buildManagedFlutterEnvironment(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  const sdkPath = getManagedFlutterSdkPath();
  if (flutterSdkReady()) {
    env.FLUTTER_ROOT = sdkPath;
    env.FLUTTER_SDK_DIR = sdkPath;
    const binDir = path.join(sdkPath, "bin");
    const dartBinDir = path.join(sdkPath, "bin", "cache", "dart-sdk", "bin");
    const additions = [binDir, dartBinDir];
    env.PATH = [...additions, base.PATH ?? process.env.PATH ?? ""]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return env;
}

// ── Download + extract helpers (mirrors managed_android) ─────────────────

async function downloadToFile(params: {
  url: string;
  destination: string;
  expectedSha256?: string | null;
  signal?: AbortSignal;
  onBytes?: (downloadedBytes: number, totalBytes: number | null) => void;
}): Promise<{ sha256: string; sizeBytes: number }> {
  throwIfAborted(params.signal);
  await fsp.mkdir(path.dirname(params.destination), { recursive: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  params.signal?.addEventListener("abort", forwardAbort, { once: true });
  const hash = createHash("sha256");
  const handle = await fsp.open(params.destination, "w");
  try {
    const response = await fetch(params.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "CAIDE-Mobile-Builder" },
    });
    if (!response.ok || !response.body) {
      throw new CaideError(
        `Flutter download failed with HTTP ${response.status}.`,
        CaideErrorKind.External,
      );
    }
    const totalHeader = response.headers.get("content-length");
    const totalBytes = totalHeader ? Number.parseInt(totalHeader, 10) : null;
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    for (;;) {
      throwIfAborted(params.signal);
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      await handle.write(chunk);
      hash.update(chunk);
      downloadedBytes += chunk.length;
      params.onBytes?.(downloadedBytes, totalBytes);
    }
    const sha256 = hash.digest("hex");
    if (params.expectedSha256 && sha256.toLowerCase() !== params.expectedSha256.toLowerCase()) {
      throw new CaideError(
        "Downloaded Flutter archive failed SHA-256 verification.",
        CaideErrorKind.External,
      );
    }
    return { sha256, sizeBytes: downloadedBytes };
  } finally {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", forwardAbort);
    await handle.close();
  }
}

async function readAt(handle: FileHandle, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error("Unexpected end of ZIP archive.");
  return buffer;
}

async function extractZip(
  archivePath: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  await fsp.mkdir(destination, { recursive: true });
  const handle = await fsp.open(archivePath, "r");
  try {
    const stat = await handle.stat();
    const tailLength = Math.min(stat.size, 65_557);
    const tail = await readAt(handle, tailLength, stat.size - tailLength);
    let eocdOffset = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (tail.readUInt32LE(offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("ZIP central directory was not found.");
    const entryCount = tail.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = tail.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = tail.readUInt32LE(eocdOffset + 16);
    if (
      entryCount === 0xffff ||
      centralDirectorySize === 0xffffffff ||
      centralDirectoryOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 archives are not supported by this installer.");
    }
    const directory = await readAt(handle, centralDirectorySize, centralDirectoryOffset);
    let offset = 0;
    for (let index = 0; index < entryCount; index += 1) {
      throwIfAborted(signal);
      if (directory.readUInt32LE(offset) !== 0x02014b50)
        throw new Error("Invalid ZIP central directory entry.");
      const compressionMethod = directory.readUInt16LE(offset + 10);
      const compressedSize = directory.readUInt32LE(offset + 20);
      const uncompressedSize = directory.readUInt32LE(offset + 24);
      const fileNameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const externalAttributes = directory.readUInt32LE(offset + 38);
      const localHeaderOffset = directory.readUInt32LE(offset + 42);
      const rawName = directory
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf8");
      const entryName = safeArchiveEntryPath(rawName);
      const outputPath = path.join(destination, ...entryName.split("/"));
      const isDirectory = rawName.endsWith("/");
      if (isDirectory) {
        await fsp.mkdir(outputPath, { recursive: true });
      } else {
        const localHeader = await readAt(handle, 30, localHeaderOffset);
        if (localHeader.readUInt32LE(0) !== 0x04034b50)
          throw new Error("Invalid ZIP local-file header.");
        const localNameLength = localHeader.readUInt16LE(26);
        const localExtraLength = localHeader.readUInt16LE(28);
        const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = await readAt(handle, compressedSize, dataOffset);
        const output =
          compressionMethod === 0
            ? compressed
            : compressionMethod === 8
              ? inflateRawSync(compressed)
              : (() => {
                  throw new Error(`Unsupported ZIP compression method ${compressionMethod}.`);
                })();
        if (output.length !== uncompressedSize)
          throw new Error(`ZIP size verification failed for ${entryName}.`);
        await fsp.mkdir(path.dirname(outputPath), { recursive: true });
        await fsp.writeFile(outputPath, output);
        const unixMode = (externalAttributes >>> 16) & 0xffff;
        if (process.platform !== "win32" && (unixMode & 0o111) !== 0) {
          await fsp.chmod(outputPath, 0o755).catch(() => undefined);
        }
      }
      offset += 46 + fileNameLength + extraLength + commentLength;
    }
  } finally {
    await handle.close();
  }
}

async function runProcess(params: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onOutput?: (output: string) => void;
}): Promise<void> {
  throwIfAborted(params.signal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: params.env,
      windowsHide: true,
      shell: process.platform === "win32" && /\.bat$/i.test(params.command),
      stdio: "pipe",
      signal: params.signal,
    });
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => params.onOutput?.(chunk.toString()));
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr = (stderr + value).slice(-64_000);
      params.onOutput?.(value);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (params.signal?.aborted) {
        reject(
          new CaideError(
            "Flutter toolchain installation was cancelled.",
            CaideErrorKind.UserCancelled,
          ),
        );
      } else if (code === 0) {
        resolve();
      } else {
        reject(
          new CaideError(
            `Toolchain command failed with exit code ${code ?? "unknown"}.\n${stderr}`,
            CaideErrorKind.External,
          ),
        );
      }
    });
    child.stdin.end();
  });
}

async function extractTar(
  archivePath: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  await fsp.mkdir(destination, { recursive: true });
  // Use system tar; handles .tar.xz and .tar.gz via auto-detect (bsdtar/gnutar)
  await runProcess({
    command: "tar",
    args: ["-xf", archivePath, "-C", destination],
    cwd: destination,
    env: process.env,
    signal,
  });
}

async function verifyManagedFlutter(): Promise<void> {
  if (!flutterSdkReady()) {
    throw new CaideError(
      "Flutter SDK installation completed but flutter binary is missing.",
      CaideErrorKind.External,
    );
  }
  // Best-effort version check (flutter --version must exit 0)
  await runProcess({
    command: getManagedFlutterBin(),
    args: ["--version"],
    cwd: getManagedFlutterRoot(),
    env: buildManagedFlutterEnvironment(process.env),
  });
}

export async function installManagedFlutterToolchain(params: {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}): Promise<FlutterToolchainStatus> {
  if (!isSupportedHost()) {
    throw new CaideError(
      "Flutter managed toolchain is unavailable on this platform.",
      CaideErrorKind.Precondition,
    );
  }
  if (activeInstall) return activeInstall;

  lastInstallProgress = null;
  const installPromise = (async () => {
    const root = getManagedFlutterRoot();
    const stagingRoot = path.join(root, ".staging");
    await fsp.mkdir(stagingRoot, { recursive: true });
    const artifact = resolveArtifact();
    if (!artifact)
      throw new CaideError("No Flutter artifact for this platform.", CaideErrorKind.Precondition);

    try {
      emit(params.onProgress, {
        phase: "preparing",
        percent: 1,
        componentPercent: 0,
        downloadedBytes: 0,
        totalBytes: artifact.sizeBytes,
        message: `Preparing Flutter ${FLUTTER_PINNED_VERSION}…`,
      });

      const archivePath = path.join(stagingRoot, artifact.fileName);
      await downloadToFile({
        url: artifact.url,
        destination: archivePath,
        expectedSha256: artifact.sha256 ?? undefined,
        signal: params.signal,
        onBytes: (downloadedBytes, totalBytes) => {
          const componentPercent = totalBytes
            ? Math.round((downloadedBytes / totalBytes) * 100)
            : 0;
          emit(params.onProgress, {
            phase: "download-flutter",
            percent: 1 + componentPercent * 0.6,
            componentPercent,
            downloadedBytes,
            totalBytes,
            message: `Downloading Flutter ${FLUTTER_PINNED_VERSION}… ${componentPercent}%`,
          });
        },
      });

      throwIfAborted(params.signal);
      emit(params.onProgress, {
        phase: "extract-flutter",
        percent: 62,
        componentPercent: 0,
        downloadedBytes: artifact.sizeBytes,
        totalBytes: artifact.sizeBytes,
        message: "Extracting Flutter SDK…",
      });

      const extracted = path.join(stagingRoot, "flutter-extracted");
      await fsp.rm(extracted, { recursive: true, force: true });
      if (artifact.kind === "zip") {
        await extractZip(archivePath, extracted, params.signal);
      } else {
        await extractTar(archivePath, extracted, params.signal);
      }

      // Flutter archive contains top-level "flutter" directory
      let sourceFlutterDir = path.join(extracted, "flutter");
      if (!fs.existsSync(sourceFlutterDir)) {
        // Some archives may have different nesting; search for flutter/bin
        const entries = await fsp.readdir(extracted, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const cand = path.join(extracted, entry.name, "bin", executableName("flutter"));
          if (fs.existsSync(cand)) {
            sourceFlutterDir = path.join(extracted, entry.name);
            break;
          }
        }
      }
      if (!fs.existsSync(sourceFlutterDir)) {
        throw new Error("Extracted Flutter archive has unexpected layout (no flutter/ dir).");
      }

      // Move into managed root
      await fsp.rm(getManagedFlutterSdkPath(), { recursive: true, force: true });
      await fsp.mkdir(path.dirname(getManagedFlutterSdkPath()), { recursive: true });
      await fsp.rename(sourceFlutterDir, getManagedFlutterSdkPath()).catch(async (error) => {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await fsp.cp(sourceFlutterDir, getManagedFlutterSdkPath(), { recursive: true });
        await fsp.rm(sourceFlutterDir, { recursive: true, force: true });
      });

      // Ensure executables are runnable on posix
      if (process.platform !== "win32") {
        const flutterBin = getManagedFlutterBin();
        const dartBin = getManagedDartBin();
        await fsp.chmod(flutterBin, 0o755).catch(() => undefined);
        await fsp.chmod(dartBin, 0o755).catch(() => undefined);
        const binDir = path.join(getManagedFlutterSdkPath(), "bin");
        try {
          for (const name of await fsp.readdir(binDir)) {
            await fsp.chmod(path.join(binDir, name), 0o755).catch(() => undefined);
          }
        } catch {}
      }

      await fsp.rm(archivePath, { force: true }).catch(() => undefined);

      emit(params.onProgress, {
        phase: "verifying",
        percent: 90,
        componentPercent: 0,
        downloadedBytes: artifact.sizeBytes,
        totalBytes: artifact.sizeBytes,
        message: "Verifying Flutter SDK…",
      });
      await verifyManagedFlutter();

      emit(params.onProgress, {
        phase: "done",
        percent: 100,
        componentPercent: 100,
        downloadedBytes: artifact.sizeBytes,
        totalBytes: artifact.sizeBytes,
        message: `Flutter ${FLUTTER_PINNED_VERSION} is ready.`,
      });

      return await inspectManagedFlutterToolchain();
    } finally {
      await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  })();

  activeInstall = installPromise;
  try {
    return await installPromise;
  } finally {
    if (activeInstall === installPromise) activeInstall = null;
  }
}

/**
 * Ensure a runnable Flutter SDK is available.
 * Prefers managed SDK; falls back to host `flutter` on PATH.
 * If neither exists and managed is supported, auto-installs it (emits progress).
 * Returns the flutter binary path to use.
 */
export async function ensureManagedFlutter(params?: {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}): Promise<string> {
  // Managed ready → use it
  if (flutterSdkReady()) return getManagedFlutterBin();
  // Host flutter available → use host (no download)
  // Check FLUTTER_ROOT or PATH
  if (
    process.env.FLUTTER_ROOT &&
    fs.existsSync(path.join(process.env.FLUTTER_ROOT, "bin", executableName("flutter")))
  ) {
    return path.join(process.env.FLUTTER_ROOT, "bin", executableName("flutter"));
  }
  try {
    const { execSync } = await import("node:child_process");
    const which = execSync(process.platform === "win32" ? "where flutter" : "which flutter", {
      stdio: "pipe",
      timeout: 5_000,
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    if (which && fs.existsSync(which)) return which;
  } catch {}

  if (!isSupportedHost()) {
    throw new CaideError(
      "Flutter SDK is not installed and auto-install is unavailable on this platform. Please install Flutter manually.",
      CaideErrorKind.Precondition,
    );
  }

  await installManagedFlutterToolchain({ onProgress: params?.onProgress, signal: params?.signal });
  return getManagedFlutterBin();
}
