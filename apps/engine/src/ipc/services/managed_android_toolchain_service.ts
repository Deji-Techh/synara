import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { app as electronApp } from "electron";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import type {
  ManagedToolchainProgress,
  ManagedToolchainStatus,
} from "../types/capacitor";
import {
  parseAndroidRequirementsFromSources,
  parseSdkManagerPercent,
  safeArchiveEntryPath,
  type AndroidProjectRequirements,
} from "./managed_android_toolchain_helpers";

const JDK_FEATURE_VERSION = 21;
const ANDROID_COMMAND_LINE_TOOLS_REVISION = "15859902";
const ANDROID_SDK_LICENSE_URL = "https://developer.android.com/studio/terms";
const MANAGED_TOOLCHAIN_VERSION = "2026.07.1";
const DOWNLOAD_TIMEOUT_MS = 45 * 60 * 1000;
const PROCESS_TIMEOUT_MS = 45 * 60 * 1000;

const ANDROID_COMMAND_LINE_ARTIFACTS = {
  win32: {
    fileName: `commandlinetools-win-${ANDROID_COMMAND_LINE_TOOLS_REVISION}_latest.zip`,
    sha256: "90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a",
    sizeBytes: 155_700_000,
  },
  linux: {
    fileName: `commandlinetools-linux-${ANDROID_COMMAND_LINE_TOOLS_REVISION}_latest.zip`,
    sha256: "4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583",
    sizeBytes: 181_800_000,
  },
} as const;

type SupportedHost = keyof typeof ANDROID_COMMAND_LINE_ARTIFACTS;
type ProgressCallback = (
  progress: Omit<ManagedToolchainProgress, "appId">,
) => void;

interface DownloadResult {
  sha256: string;
  sizeBytes: number;
}

interface AdoptiumPackage {
  link: string;
  checksum: string;
  name: string;
  size: number;
}

let activeInstall: Promise<ManagedToolchainStatus> | null = null;

function executableName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function commandName(name: string): string {
  return process.platform === "win32" ? `${name}.bat` : name;
}

export function getManagedToolchainRoot(): string {
  return path.join(
    electronApp.getPath("userData"),
    "toolchains",
    MANAGED_TOOLCHAIN_VERSION,
  );
}

export function getManagedAndroidSdkPath(): string {
  return path.join(getManagedToolchainRoot(), "android-sdk");
}

export function getManagedJdkHome(): string {
  return path.join(getManagedToolchainRoot(), `jdk-${JDK_FEATURE_VERSION}`);
}

function isSupportedHost(): boolean {
  return (
    (process.platform === "win32" || process.platform === "linux") &&
    process.arch === "x64"
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CaideError(
      "Android toolchain installation was cancelled.",
      CaideErrorKind.UserCancelled,
    );
  }
}

function emit(
  onProgress: ProgressCallback | undefined,
  progress: Omit<ManagedToolchainProgress, "appId">,
): void {
  onProgress?.(progress);
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function inspectAndroidProjectRequirements(
  appPath: string,
): Promise<AndroidProjectRequirements> {
  const candidates = [
    path.join(appPath, "android", "variables.gradle"),
    path.join(appPath, "android", "build.gradle"),
    path.join(appPath, "android", "build.gradle.kts"),
    path.join(appPath, "android", "app", "build.gradle"),
    path.join(appPath, "android", "app", "build.gradle.kts"),
    path.join(appPath, "android", "gradle", "libs.versions.toml"),
  ];
  return parseAndroidRequirementsFromSources(
    await Promise.all(candidates.map(readIfExists)),
  );
}

function managedJdkReady(): boolean {
  return fs.existsSync(
    path.join(getManagedJdkHome(), "bin", executableName("javac")),
  );
}

function managedSdkManagerPath(): string {
  return path.join(
    getManagedAndroidSdkPath(),
    "cmdline-tools",
    "latest",
    "bin",
    commandName("sdkmanager"),
  );
}

function managedSdkToolsReady(
  requirements: AndroidProjectRequirements,
): boolean {
  const sdk = getManagedAndroidSdkPath();
  return [
    managedSdkManagerPath(),
    path.join(sdk, "platform-tools", executableName("adb")),
    path.join(
      sdk,
      "platforms",
      `android-${requirements.compileSdk}`,
      "android.jar",
    ),
    path.join(
      sdk,
      "build-tools",
      requirements.buildToolsVersion,
      executableName("zipalign"),
    ),
    path.join(
      sdk,
      "build-tools",
      requirements.buildToolsVersion,
      commandName("apksigner"),
    ),
  ].every((candidate) => fs.existsSync(candidate));
}

export async function inspectManagedAndroidToolchain(
  appPath: string,
): Promise<ManagedToolchainStatus> {
  const requirements = await inspectAndroidProjectRequirements(appPath);
  const jdkInstalled = managedJdkReady();
  const commandLineToolsInstalled = fs.existsSync(managedSdkManagerPath());
  const sdkPackagesInstalled = managedSdkToolsReady(requirements);
  const supported = isSupportedHost();
  const commandArtifact = supported
    ? ANDROID_COMMAND_LINE_ARTIFACTS[process.platform as SupportedHost]
    : null;
  const estimatedDownloadBytes =
    (jdkInstalled ? 0 : 210_000_000) +
    (commandLineToolsInstalled ? 0 : (commandArtifact?.sizeBytes ?? 0)) +
    (sdkPackagesInstalled ? 0 : 450_000_000);

  return {
    supported,
    installed:
      jdkInstalled && commandLineToolsInstalled && sdkPackagesInstalled,
    root: getManagedToolchainRoot(),
    androidSdkPath: getManagedAndroidSdkPath(),
    jdkHome: getManagedJdkHome(),
    licenseUrl: ANDROID_SDK_LICENSE_URL,
    estimatedDownloadBytes,
    jdkInstalled,
    commandLineToolsInstalled,
    sdkPackagesInstalled,
    requiredPackages: requirements.sdkPackages,
    compileSdk: requirements.compileSdk,
    buildToolsVersion: requirements.buildToolsVersion,
    unsupportedReason: supported
      ? null
      : "Caide Managed Android tools currently support 64-bit Windows and Linux.",
  };
}

export function buildManagedToolchainEnvironment(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  const additions: string[] = [];
  const jdkHome = getManagedJdkHome();
  const sdkPath = getManagedAndroidSdkPath();

  if (managedJdkReady()) {
    env.CAIDE_JAVA_HOME = jdkHome;
    env.JAVA_HOME = jdkHome;
    additions.push(path.join(jdkHome, "bin"));
  }
  if (fs.existsSync(managedSdkManagerPath())) {
    env.CAIDE_ANDROID_SDK_ROOT = sdkPath;
    env.ANDROID_HOME = sdkPath;
    env.ANDROID_SDK_ROOT = sdkPath;
    additions.push(
      path.join(sdkPath, "cmdline-tools", "latest", "bin"),
      path.join(sdkPath, "platform-tools"),
    );
  }
  env.PATH = [...additions, base.PATH ?? process.env.PATH ?? ""]
    .filter(Boolean)
    .join(path.delimiter);
  return env;
}

async function downloadToFile(params: {
  url: string;
  destination: string;
  expectedSha256?: string;
  signal?: AbortSignal;
  onBytes?: (downloadedBytes: number, totalBytes: number | null) => void;
}): Promise<DownloadResult> {
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
        `Download failed with HTTP ${response.status}.`,
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
    if (
      params.expectedSha256 &&
      sha256.toLowerCase() !== params.expectedSha256.toLowerCase()
    ) {
      throw new CaideError(
        "Downloaded toolchain archive failed its SHA-256 verification.",
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

async function readAt(
  handle: FileHandle,
  length: number,
  position: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("Unexpected end of ZIP archive.");
  }
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
    const directory = await readAt(
      handle,
      centralDirectorySize,
      centralDirectoryOffset,
    );
    let offset = 0;
    for (let index = 0; index < entryCount; index += 1) {
      throwIfAborted(signal);
      if (directory.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error("Invalid ZIP central directory entry.");
      }
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
        if (localHeader.readUInt32LE(0) !== 0x04034b50) {
          throw new Error("Invalid ZIP local-file header.");
        }
        const localNameLength = localHeader.readUInt16LE(26);
        const localExtraLength = localHeader.readUInt16LE(28);
        const dataOffset =
          localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = await readAt(handle, compressedSize, dataOffset);
        const output =
          compressionMethod === 0
            ? compressed
            : compressionMethod === 8
              ? inflateRawSync(compressed)
              : (() => {
                  throw new Error(
                    `Unsupported ZIP compression method ${compressionMethod}.`,
                  );
                })();
        if (output.length !== uncompressedSize) {
          throw new Error(`ZIP size verification failed for ${entryName}.`);
        }
        await fsp.mkdir(path.dirname(outputPath), { recursive: true });
        await fsp.writeFile(outputPath, output);
        const unixMode = (externalAttributes >>> 16) & 0xffff;
        if (process.platform !== "win32" && (unixMode & 0o111) !== 0) {
          await fsp.chmod(outputPath, 0o755);
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
  input?: string;
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
            "Android toolchain installation was cancelled.",
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
    if (params.input) child.stdin.end(params.input);
    else child.stdin.end();
  });
}

async function extractTarGz(
  archivePath: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  await fsp.mkdir(destination, { recursive: true });
  await runProcess({
    command: "tar",
    args: ["-xzf", archivePath, "-C", destination],
    cwd: destination,
    env: process.env,
    signal,
  });
}

async function moveDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await fsp.rm(destination, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fsp.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fsp.cp(source, destination, { recursive: true });
    await fsp.rm(source, { recursive: true, force: true });
  }
}

async function findDirectoryContaining(
  root: string,
  relativeExecutable: string,
): Promise<string> {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (fs.existsSync(path.join(candidate, relativeExecutable)))
      return candidate;
  }
  if (fs.existsSync(path.join(root, relativeExecutable))) return root;
  throw new Error(`Extracted archive does not contain ${relativeExecutable}.`);
}

async function resolveAdoptiumPackage(
  signal?: AbortSignal,
): Promise<AdoptiumPackage> {
  const architecture = process.arch === "arm64" ? "aarch64" : "x64";
  const osName = process.platform === "win32" ? "windows" : "linux";
  const url = new URL(
    `https://api.adoptium.net/v3/assets/latest/${JDK_FEATURE_VERSION}/hotspot`,
  );
  url.searchParams.set("architecture", architecture);
  url.searchParams.set("image_type", "jdk");
  url.searchParams.set("os", osName);
  url.searchParams.set("vendor", "eclipse");
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": "CAIDE-Mobile-Builder" },
  });
  if (!response.ok) {
    throw new CaideError(
      `Could not resolve a managed JDK download (HTTP ${response.status}).`,
      CaideErrorKind.External,
    );
  }
  const assets = (await response.json()) as Array<{
    binary?: { package?: Partial<AdoptiumPackage> };
  }>;
  const packageInfo = assets.find(
    (asset) =>
      asset.binary?.package?.link &&
      asset.binary.package.checksum &&
      asset.binary.package.name,
  )?.binary?.package;
  if (
    !packageInfo?.link ||
    !packageInfo.checksum ||
    !packageInfo.name ||
    typeof packageInfo.size !== "number"
  ) {
    throw new CaideError(
      "The JDK provider returned no compatible archive.",
      CaideErrorKind.External,
    );
  }
  return packageInfo as AdoptiumPackage;
}

async function installJdk(
  stagingRoot: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (managedJdkReady()) return;
  emit(onProgress, {
    phase: "preparing",
    percent: 2,
    componentPercent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    message: "Resolving the Caide-managed Java development kit…",
  });
  const packageInfo = await resolveAdoptiumPackage(signal);
  const archivePath = path.join(stagingRoot, packageInfo.name);
  await downloadToFile({
    url: packageInfo.link,
    destination: archivePath,
    expectedSha256: packageInfo.checksum,
    signal,
    onBytes: (downloadedBytes, totalBytes) => {
      const componentPercent = totalBytes
        ? Math.round((downloadedBytes / totalBytes) * 100)
        : 0;
      emit(onProgress, {
        phase: "download-jdk",
        percent: 3 + componentPercent * 0.24,
        componentPercent,
        downloadedBytes,
        totalBytes,
        message: "Downloading Caide Managed JDK 21…",
      });
    },
  });
  throwIfAborted(signal);
  emit(onProgress, {
    phase: "extract-jdk",
    percent: 28,
    componentPercent: 0,
    downloadedBytes: packageInfo.size,
    totalBytes: packageInfo.size,
    message: "Installing the Java development kit…",
  });
  const extracted = path.join(stagingRoot, "jdk-extracted");
  await fsp.rm(extracted, { recursive: true, force: true });
  if (packageInfo.name.endsWith(".zip")) {
    await extractZip(archivePath, extracted, signal);
  } else {
    await extractTarGz(archivePath, extracted, signal);
  }
  const jdkRoot = await findDirectoryContaining(
    extracted,
    path.join("bin", executableName("javac")),
  );
  await moveDirectory(jdkRoot, getManagedJdkHome());
  await fsp.rm(archivePath, { force: true });
}

async function installAndroidCommandLineTools(
  stagingRoot: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (fs.existsSync(managedSdkManagerPath())) return;
  if (!isSupportedHost()) {
    throw new CaideError(
      "Caide Managed Android tools are unavailable on this platform.",
      CaideErrorKind.Precondition,
    );
  }
  const artifact =
    ANDROID_COMMAND_LINE_ARTIFACTS[process.platform as SupportedHost];
  const archivePath = path.join(stagingRoot, artifact.fileName);
  const downloadUrl = `https://dl.google.com/android/repository/${artifact.fileName}`;
  await downloadToFile({
    url: downloadUrl,
    destination: archivePath,
    expectedSha256: artifact.sha256,
    signal,
    onBytes: (downloadedBytes, totalBytes) => {
      const componentPercent = totalBytes
        ? Math.round((downloadedBytes / totalBytes) * 100)
        : 0;
      emit(onProgress, {
        phase: "download-android-tools",
        percent: 31 + componentPercent * 0.24,
        componentPercent,
        downloadedBytes,
        totalBytes,
        message: "Downloading Android command-line tools…",
      });
    },
  });
  throwIfAborted(signal);
  emit(onProgress, {
    phase: "extract-android-tools",
    percent: 56,
    componentPercent: 0,
    downloadedBytes: artifact.sizeBytes,
    totalBytes: artifact.sizeBytes,
    message: "Installing Android command-line tools…",
  });
  const extracted = path.join(stagingRoot, "android-tools-extracted");
  await fsp.rm(extracted, { recursive: true, force: true });
  await extractZip(archivePath, extracted, signal);
  const source = path.join(extracted, "cmdline-tools");
  if (!fs.existsSync(source)) {
    throw new Error("Android command-line archive has an unexpected layout.");
  }
  await moveDirectory(
    source,
    path.join(getManagedAndroidSdkPath(), "cmdline-tools", "latest"),
  );
  if (process.platform !== "win32") {
    const binPath = path.join(
      getManagedAndroidSdkPath(),
      "cmdline-tools",
      "latest",
      "bin",
    );
    for (const name of await fsp.readdir(binPath)) {
      await fsp.chmod(path.join(binPath, name), 0o755).catch(() => undefined);
    }
  }
  await fsp.rm(archivePath, { force: true });
}

async function installSdkPackages(
  requirements: AndroidProjectRequirements,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (managedSdkToolsReady(requirements)) return;
  const sdkPath = getManagedAndroidSdkPath();
  const sdkManager = managedSdkManagerPath();
  const env = buildManagedToolchainEnvironment(process.env);
  const acceptance = `${"y\n".repeat(80)}`;
  emit(onProgress, {
    phase: "licenses",
    percent: 61,
    componentPercent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    message: "Recording Android SDK licence acceptance…",
  });
  await runProcess({
    command: sdkManager,
    args: [`--sdk_root=${sdkPath}`, "--licenses"],
    cwd: getManagedToolchainRoot(),
    env,
    signal,
    input: acceptance,
  });
  emit(onProgress, {
    phase: "sdk-packages",
    percent: 66,
    componentPercent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    message: `Installing Android API ${requirements.compileSdk}, build tools, and platform tools…`,
  });
  let output = "";
  await runProcess({
    command: sdkManager,
    args: [`--sdk_root=${sdkPath}`, ...requirements.sdkPackages],
    cwd: getManagedToolchainRoot(),
    env,
    signal,
    input: acceptance,
    onOutput: (chunk) => {
      output = (output + chunk).slice(-8_000);
      const componentPercent = parseSdkManagerPercent(output) ?? 0;
      emit(onProgress, {
        phase: "sdk-packages",
        percent: 66 + componentPercent * 0.28,
        componentPercent,
        downloadedBytes: 0,
        totalBytes: null,
        message: `Installing Android API ${requirements.compileSdk}, build tools, and platform tools…`,
      });
    },
  });
}

async function verifyManagedToolchain(
  requirements: AndroidProjectRequirements,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  emit(onProgress, {
    phase: "verifying",
    percent: 96,
    componentPercent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    message: "Verifying the managed Android build environment…",
  });
  if (!managedJdkReady() || !managedSdkToolsReady(requirements)) {
    throw new CaideError(
      "The Android toolchain installation completed but required executables are missing. Use Repair and try again.",
      CaideErrorKind.External,
    );
  }
  await runProcess({
    command: path.join(getManagedJdkHome(), "bin", executableName("javac")),
    args: ["-version"],
    cwd: getManagedToolchainRoot(),
    env: buildManagedToolchainEnvironment(process.env),
    signal,
  });
}

export async function installManagedAndroidToolchain(params: {
  appPath: string;
  acceptAndroidSdkLicense: boolean;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}): Promise<ManagedToolchainStatus> {
  if (!params.acceptAndroidSdkLicense) {
    throw new CaideError(
      "Accept the Android SDK licence before installing the managed toolchain.",
      CaideErrorKind.Precondition,
    );
  }
  if (!isSupportedHost()) {
    throw new CaideError(
      "Caide Managed Android tools currently support 64-bit Windows and Linux.",
      CaideErrorKind.Precondition,
    );
  }
  if (activeInstall) return activeInstall;

  const installPromise = (async () => {
    const root = getManagedToolchainRoot();
    const stagingRoot = path.join(root, ".staging");
    await fsp.mkdir(stagingRoot, { recursive: true });
    const requirements = await inspectAndroidProjectRequirements(
      params.appPath,
    );
    try {
      emit(params.onProgress, {
        phase: "preparing",
        percent: 1,
        componentPercent: 0,
        downloadedBytes: 0,
        totalBytes: null,
        message: "Preparing Caide Managed Android tools…",
      });
      await installJdk(stagingRoot, params.onProgress, params.signal);
      await installAndroidCommandLineTools(
        stagingRoot,
        params.onProgress,
        params.signal,
      );
      await installSdkPackages(requirements, params.onProgress, params.signal);
      await verifyManagedToolchain(
        requirements,
        params.onProgress,
        params.signal,
      );
      emit(params.onProgress, {
        phase: "done",
        percent: 100,
        componentPercent: 100,
        downloadedBytes: 0,
        totalBytes: null,
        message: "Android build environment is ready.",
      });
      return await inspectManagedAndroidToolchain(params.appPath);
    } finally {
      await fsp
        .rm(stagingRoot, { recursive: true, force: true })
        .catch(() => undefined);
    }
  })();
  activeInstall = installPromise;
  try {
    return await installPromise;
  } finally {
    if (activeInstall === installPromise) activeInstall = null;
  }
}
