import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import log from "electron-log/node";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import type {
  AndroidBuildTarget,
  AndroidSigningCredentials,
  CreateAndroidKeystoreParams,
  NativeAppInfo,
  NativeArtifact,
  NativeReleaseStatus,
  NativeToolStatus,
} from "../types/capacitor";
import { simpleSpawn } from "../utils/simpleSpawn";
import { getPackageManagerCommandEnv } from "../utils/socket_firewall";
import {
  compareVersionNames,
  escapeDistinguishedNameValue,
  inferArtifactKind,
  parseCapacitorConfigText,
  sanitizeArtifactName,
} from "./native_release_helpers";
import {
  buildManagedToolchainEnvironment,
  getManagedAndroidSdkPath,
  getManagedJdkHome,
  inspectManagedAndroidToolchain,
} from "./managed_android_toolchain_service";
import {
  getDartDefineFromFileArgs,
  getFlutterExecutable,
  isFlutterApp,
} from "@/ipc/utils/flutter_utils";

const logger = log.scope("native_release_service");
const NATIVE_BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const DIRECT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const NATIVE_TOOL_PROBE_TIMEOUT_MS = 2_500;
const MAX_COMMAND_OUTPUT = 1024 * 1024;

interface ProcessResult {
  stdout: string;
  stderr: string;
}

interface AndroidEnvironment {
  sdkPath: string | null;
  buildToolsPath: string | null;
  buildToolsVersion: string | null;
  platformVersion: string | null;
  adbPath: string | null;
  zipalignPath: string | null;
  apksignerPath: string | null;
  javaPath: string;
  keytoolPath: string;
  jarsignerPath: string;
}

function appendBounded(current: string, next: Buffer | string): string {
  const combined = current + next.toString();
  return combined.length <= MAX_COMMAND_OUTPUT
    ? combined
    : combined.slice(combined.length - MAX_COMMAND_OUTPUT);
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    label: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<ProcessResult> {
  logger.info(`Running native command: ${options.label}`);
  return await new Promise<ProcessResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env:
          options.env ??
          buildManagedToolchainEnvironment(getPackageManagerCommandEnv()),
        shell: process.platform === "win32" && /\.(?:bat|cmd)$/i.test(command),
        windowsHide: true,
        stdio: "pipe",
        signal: options.signal,
      });
    } catch (error) {
      reject(
        new CaideError(
          `${options.label} could not start: ${
            error instanceof Error ? error.message : String(error)
          }`,
          CaideErrorKind.External,
        ),
      );
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      settled = true;
      reject(
        new CaideError(
          `${options.label} timed out after ${Math.round(
            (options.timeoutMs ?? DIRECT_COMMAND_TIMEOUT_MS) / 60_000,
          )} minutes.`,
          CaideErrorKind.External,
        ),
      );
    }, options.timeoutMs ?? DIRECT_COMMAND_TIMEOUT_MS);

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeout);
        settled = true;
        reject(
          new CaideError(
            `${options.label} was cancelled`,
            CaideErrorKind.UserCancelled,
          ),
        );
        return;
      }
    }

    child.stdout?.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new CaideError(
          `${options.label} could not start: ${error.message}`,
          CaideErrorKind.External,
        ),
      );
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new CaideError(
          `${options.label} failed (exit code ${code ?? "unknown"}).\n\n${[
            stdout.trim() ? `STDOUT:\n${stdout.trim()}` : "",
            stderr.trim() ? `STDERR:\n${stderr.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")}`,
          CaideErrorKind.External,
        ),
      );
    });
  });
}

async function probeCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ available: boolean; output: string }> {
  try {
    const result = await runCommand(command, args, {
      cwd,
      label: `Checking ${path.basename(command)}`,
      timeoutMs: NATIVE_TOOL_PROBE_TIMEOUT_MS,
    });
    return {
      available: true,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  } catch {
    return { available: false, output: "" };
  }
}

function hostPlatform(): NativeReleaseStatus["hostPlatform"] {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return "other";
}

export function isCapacitorInstalled(appPath: string): boolean {
  return [
    "capacitor.config.js",
    "capacitor.config.ts",
    "capacitor.config.json",
  ].some((fileName) => fs.existsSync(path.join(appPath, fileName)));
}

function executableName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function firstExisting(paths: Array<string | null | undefined>): string | null {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveAndroidSdkPath(): string | null {
  const home = os.homedir();
  return firstExisting([
    process.env.CAIDE_ANDROID_SDK_ROOT,
    fs.existsSync(getManagedAndroidSdkPath())
      ? getManagedAndroidSdkPath()
      : null,
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
    process.platform === "darwin"
      ? path.join(home, "Library", "Android", "sdk")
      : null,
    process.platform === "linux" ? path.join(home, "Android", "Sdk") : null,
    "/var/lib/flatpak/app/com.google.AndroidStudio/current/active/files/Android/Sdk",
    "/snap/android-studio/current/android-studio/Android/Sdk",
  ]);
}

function latestDirectory(parent: string | null): string | null {
  if (!parent || !fs.existsSync(parent)) return null;
  const candidates = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionNames);
  const latest = candidates.at(-1);
  return latest ? path.join(parent, latest) : null;
}

function resolveAndroidEnvironment(): AndroidEnvironment {
  const sdkPath = resolveAndroidSdkPath();
  const buildToolsPath = latestDirectory(
    sdkPath ? path.join(sdkPath, "build-tools") : null,
  );
  const platformPath = latestDirectory(
    sdkPath ? path.join(sdkPath, "platforms") : null,
  );
  const javaHome = process.env.JAVA_HOME;
  const javaBin = javaHome ? path.join(javaHome, "bin") : null;
  const javaPath =
    firstExisting([
      javaBin ? path.join(javaBin, executableName("java")) : null,
    ]) ?? "java";
  const keytoolPath =
    firstExisting([
      javaBin ? path.join(javaBin, executableName("keytool")) : null,
    ]) ?? "keytool";
  const jarsignerPath =
    firstExisting([
      javaBin ? path.join(javaBin, executableName("jarsigner")) : null,
    ]) ?? "jarsigner";

  return {
    sdkPath,
    buildToolsPath,
    buildToolsVersion: buildToolsPath ? path.basename(buildToolsPath) : null,
    platformVersion: platformPath
      ? path.basename(platformPath).replace(/^android-/, "")
      : null,
    adbPath: firstExisting([
      sdkPath
        ? path.join(sdkPath, "platform-tools", executableName("adb"))
        : null,
    ]),
    zipalignPath: firstExisting([
      buildToolsPath
        ? path.join(buildToolsPath, executableName("zipalign"))
        : null,
    ]),
    apksignerPath: firstExisting([
      buildToolsPath
        ? path.join(
            buildToolsPath,
            process.platform === "win32" ? "apksigner.bat" : "apksigner",
          )
        : null,
    ]),
    javaPath,
    keytoolPath,
    jarsignerPath,
  };
}

export function resolveAndroidStudioPath(): string | null {
  const home = os.homedir();
  if (process.platform === "win32") {
    return firstExisting([
      process.env.ANDROID_STUDIO_PATH,
      process.env.ProgramFiles
        ? path.join(
            process.env.ProgramFiles,
            "Android",
            "Android Studio",
            "bin",
            "studio64.exe",
          )
        : null,
      process.env.LOCALAPPDATA
        ? path.join(
            process.env.LOCALAPPDATA,
            "Programs",
            "Android Studio",
            "bin",
            "studio64.exe",
          )
        : null,
    ]);
  }
  if (process.platform === "darwin") {
    return firstExisting([
      process.env.ANDROID_STUDIO_PATH,
      "/Applications/Android Studio.app",
      path.join(home, "Applications", "Android Studio.app"),
    ]);
  }
  return firstExisting([
    process.env.ANDROID_STUDIO_PATH,
    "/opt/android-studio/bin/studio.sh",
    "/usr/local/android-studio/bin/studio.sh",
    "/var/lib/flatpak/app/com.google.AndroidStudio/current/active/files/bin/studio.sh",
    "/snap/android-studio/current/android-studio/bin/studio.sh",
    path.join(home, "android-studio", "bin", "studio.sh"),
    path.join(
      home,
      ".local",
      "share",
      "JetBrains",
      "Toolbox",
      "apps",
      "android-studio",
      "bin",
      "studio.sh",
    ),
  ]);
}

function extractVersion(output: string): string | null {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 160) ?? null;
}

async function readNativeAppInfo(
  appPath: string,
  fallbackName: string,
): Promise<NativeAppInfo> {
  if (isFlutterApp(appPath)) {
    return readFlutterAppInfo(appPath, fallbackName);
  }

  let packageVersion: string | null = null;
  try {
    const packageJson = JSON.parse(
      await fsp.readFile(path.join(appPath, "package.json"), "utf8"),
    ) as { version?: unknown; name?: unknown };
    packageVersion =
      typeof packageJson.version === "string" ? packageJson.version : null;
    if (!fallbackName && typeof packageJson.name === "string") {
      fallbackName = packageJson.name;
    }
  } catch {
    // The release status should remain useful for partially generated projects.
  }

  let config = { appId: null, appName: null, webDir: null } as ReturnType<
    typeof parseCapacitorConfigText
  >;
  for (const fileName of [
    "capacitor.config.ts",
    "capacitor.config.js",
    "capacitor.config.json",
  ]) {
    const configPath = path.join(appPath, fileName);
    if (!fs.existsSync(configPath)) continue;
    config = parseCapacitorConfigText(
      await fsp.readFile(configPath, "utf8"),
      path.extname(configPath),
    );
    break;
  }

  let versionCode: number | null = null;
  let nativeVersionName: string | null = null;
  for (const gradleName of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = path.join(appPath, "android", "app", gradleName);
    if (!fs.existsSync(gradlePath)) continue;
    const source = await fsp.readFile(gradlePath, "utf8");
    const codeMatch = /versionCode\s*(?:=\s*)?(\d+)/.exec(source);
    const nameMatch = /versionName\s*(?:=\s*)?["']([^"']+)["']/.exec(source);
    versionCode = codeMatch ? Number.parseInt(codeMatch[1], 10) : null;
    nativeVersionName = nameMatch?.[1] ?? null;
    break;
  }

  return {
    name: config.appName ?? fallbackName,
    packageId: config.appId,
    versionName: nativeVersionName ?? packageVersion,
    versionCode,
    webDir: config.webDir,
  };
}

async function readFlutterAppInfo(
  appPath: string,
  fallbackName: string,
): Promise<NativeAppInfo> {
  let appName = fallbackName;
  let versionName: string | null = null;
  let versionCode: number | null = null;
  try {
    const pubspecPath = path.join(appPath, "pubspec.yaml");
    if (fs.existsSync(pubspecPath)) {
      const pubspec = await fsp.readFile(pubspecPath, "utf8");
      const nameMatch = /^name:\s*["']?([^"'\s]+)/m.exec(pubspec);
      if (nameMatch?.[1]) appName = nameMatch[1];
      const versionMatch =
        /^version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9]+)?)/m.exec(pubspec);
      if (versionMatch?.[1]) {
        const [semver, build] = versionMatch[1].split("+");
        versionName = semver;
        versionCode = build ? Number.parseInt(build, 10) : null;
      }
    }
  } catch {
    // Best-effort; fall back to the app name from the database.
  }

  let packageId: string | null = null;
  for (const gradleName of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = path.join(appPath, "android", "app", gradleName);
    if (!fs.existsSync(gradlePath)) continue;
    const source = await fsp.readFile(gradlePath, "utf8");
    const idMatch = /applicationId\s*["']([^"']+)["']/.exec(source);
    packageId = idMatch?.[1] ?? null;
    break;
  }

  return {
    name: appName,
    packageId,
    versionName,
    versionCode,
    webDir: null,
  };
}

async function walkArtifacts(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) return [];
  const results: string[] = [];
  const pending = [root];
  while (pending.length > 0 && results.length < 50) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (inferArtifactKind(fullPath)) results.push(fullPath);
    }
  }
  return results;
}

async function artifactFromPath(
  artifactPath: string,
  sha256: string | null = null,
): Promise<NativeArtifact> {
  const kind = inferArtifactKind(artifactPath);
  if (!kind) {
    throw new CaideError(
      "The selected file is not a supported native artifact.",
      CaideErrorKind.Validation,
    );
  }
  const stat = await fsp.stat(artifactPath);
  const fileName = path.basename(artifactPath);
  return {
    path: artifactPath,
    fileName,
    kind,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
    sha256,
    signed:
      kind === "debug-apk" || !fileName.toLowerCase().includes("unsigned"),
    installable: kind === "debug-apk" || kind === "release-apk",
  };
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function recordArtifactChecksum(filePath: string): Promise<string> {
  const checksum = await hashFile(filePath);
  await fsp.writeFile(
    `${filePath}.sha256`,
    `${checksum}  ${path.basename(filePath)}\n`,
    "utf8",
  );
  return checksum;
}

async function readRecordedChecksum(filePath: string): Promise<string | null> {
  try {
    const value = await fsp.readFile(`${filePath}.sha256`, "utf8");
    const checksum = value.trim().split(/\s+/)[0];
    return /^[a-f0-9]{64}$/i.test(checksum) ? checksum.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function collectArtifacts(appPath: string): Promise<NativeArtifact[]> {
  const androidOutputs = path.join(
    appPath,
    "android",
    "app",
    "build",
    "outputs",
  );
  const artifactPaths = await walkArtifacts(androidOutputs);
  const relevantArtifacts = artifactPaths.filter((artifactPath) => {
    const name = path.basename(artifactPath).toLowerCase();
    return (
      name.endsWith(".apk") || name.endsWith(".aab") || name.endsWith(".ipa")
    );
  });
  const artifacts = await Promise.all(
    relevantArtifacts.map(async (artifactPath) =>
      artifactFromPath(artifactPath, await readRecordedChecksum(artifactPath)),
    ),
  );
  return artifacts
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);
}

function tool(
  value: Omit<NativeToolStatus, "version" | "location" | "remediation"> & {
    version?: string | null;
    location?: string | null;
    remediation?: string | null;
  },
): NativeToolStatus {
  return {
    ...value,
    version: value.version ?? null,
    location: value.location ?? null,
    remediation: value.remediation ?? null,
  };
}

export async function inspectNativeRelease(
  appPath: string,
  fallbackName: string,
): Promise<NativeReleaseStatus> {
  if (isFlutterApp(appPath)) {
    return inspectFlutterRelease(appPath, fallbackName);
  }

  const environment = resolveAndroidEnvironment();
  const managedToolchain = await inspectManagedAndroidToolchain(appPath);
  const androidPath = path.join(appPath, "android");
  const iosPath = path.join(appPath, "ios");
  const gradleWrapper = firstExisting([
    path.join(
      androidPath,
      process.platform === "win32" ? "gradlew.bat" : "gradlew",
    ),
  ]);
  const javacPath = resolveJdkHomeSafe();
  const [javaProbe, adbProbe, xcodeProbe] = await Promise.all([
    javacPath
      ? probeCommand(
          path.join(javacPath, "bin", executableName("javac")),
          ["-version"],
          appPath,
        )
      : probeCommand(executableName("javac"), ["-version"], appPath),
    environment.adbPath
      ? probeCommand(environment.adbPath, ["version"], appPath)
      : Promise.resolve({ available: false, output: "" }),
    process.platform === "darwin"
      ? probeCommand("xcodebuild", ["-version"], appPath)
      : Promise.resolve({ available: false, output: "" }),
  ]);
  const androidStudioPath = resolveAndroidStudioPath();
  const capacitorInstalled = isCapacitorInstalled(appPath);
  const androidProjectExists = fs.existsSync(androidPath);
  const iosProjectExists = fs.existsSync(iosPath);
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

  const tools: NativeToolStatus[] = [
    tool({
      id: "node",
      label: "Node.js",
      description:
        "Builds the web application before it is packaged for mobile.",
      requiredForAndroidBuild: true,
      state: nodeMajor >= 20 ? "ready" : "missing",
      version: process.version,
      location: process.execPath,
      remediation:
        nodeMajor >= 20
          ? null
          : "Install Node.js 20 or newer, then restart CAIDE.",
    }),
    tool({
      id: "java",
      label: "Java development kit",
      description: "Compiles Android Java/Kotlin code and runs Gradle.",
      requiredForAndroidBuild: true,
      state: javaProbe.available ? "ready" : "missing",
      version: extractVersion(javaProbe.output),
      location: javacPath ?? environment.javaPath,
      remediation: javaProbe.available ? null : platformJdkRemediation(),
    }),
    tool({
      id: "android-sdk",
      label: "Android SDK",
      description: "Provides the compiler, platform tools, and device bridge.",
      requiredForAndroidBuild: true,
      state: environment.sdkPath ? "ready" : "missing",
      location: environment.sdkPath,
      remediation: environment.sdkPath
        ? null
        : "Install the Android SDK or Android Studio, then set ANDROID_SDK_ROOT.",
    }),
    tool({
      id: "android-platform",
      label: "Android platform",
      description: "Contains the Android API used to compile the project.",
      requiredForAndroidBuild: true,
      state: environment.platformVersion ? "ready" : "missing",
      version: environment.platformVersion,
      remediation: environment.platformVersion
        ? null
        : "Install at least one Android SDK Platform in the SDK Manager.",
    }),
    tool({
      id: "android-build-tools",
      label: "Android build tools",
      description: "Creates, aligns, signs, and verifies APK and AAB files.",
      requiredForAndroidBuild: true,
      state:
        environment.buildToolsPath &&
        environment.zipalignPath &&
        environment.apksignerPath
          ? "ready"
          : "missing",
      version: environment.buildToolsVersion,
      location: environment.buildToolsPath,
      remediation: environment.buildToolsPath
        ? "Install a complete Android Build Tools package with zipalign and apksigner."
        : "Install Android SDK Build Tools in the SDK Manager.",
    }),
    tool({
      id: "gradle",
      label: "Gradle wrapper",
      description: "Compiles the generated Android project reproducibly.",
      requiredForAndroidBuild: true,
      state: gradleWrapper ? "ready" : "missing",
      location: gradleWrapper,
      remediation: gradleWrapper
        ? null
        : "Run mobile setup again so CAIDE can generate the Android project.",
    }),
    tool({
      id: "adb",
      label: "Android device bridge",
      description: "Installs an APK on a connected Android phone or emulator.",
      requiredForAndroidBuild: false,
      state: adbProbe.available ? "optional" : "missing",
      version: extractVersion(adbProbe.output),
      location: environment.adbPath,
      remediation: adbProbe.available
        ? null
        : "Install Android SDK Platform Tools to install builds from CAIDE.",
    }),
    tool({
      id: "android-studio",
      label: "Android Studio",
      description:
        "Optional advanced tool for Kotlin or Java code, emulators, profiling, and deep debugging.",
      requiredForAndroidBuild: false,
      state: androidStudioPath ? "optional" : "missing",
      location: androidStudioPath,
      remediation: androidStudioPath
        ? null
        : "Install Android Studio only if you need advanced native development.",
    }),
    tool({
      id: "xcode",
      label: "Xcode",
      description:
        "Apple's required macOS toolchain for iOS signing and distribution.",
      requiredForAndroidBuild: false,
      state:
        process.platform !== "darwin"
          ? "unsupported"
          : xcodeProbe.available
            ? "optional"
            : "missing",
      version: extractVersion(xcodeProbe.output),
      remediation:
        process.platform !== "darwin"
          ? "iOS builds require macOS."
          : xcodeProbe.available
            ? null
            : "Install Xcode from Apple and select its command-line tools.",
    }),
  ];

  const canBuildAndroid =
    capacitorInstalled &&
    androidProjectExists &&
    tools
      .filter((item) => item.requiredForAndroidBuild)
      .every((item) => item.state === "ready");

  return {
    hostPlatform: hostPlatform(),
    platformKind: "capacitor",
    capacitorInstalled,
    androidProjectExists,
    iosProjectExists,
    canBuildAndroid,
    canOpenAndroidStudio: Boolean(androidStudioPath),
    canOpenXcode: process.platform === "darwin" && xcodeProbe.available,
    app: await readNativeAppInfo(appPath, fallbackName),
    tools,
    artifacts: await collectArtifacts(appPath),
    managedToolchain,
  };
}

/**
 * Release status for a Flutter app: probes the Flutter SDK and the shared
 * Android/iOS toolchain, then reports the native project readiness. Flutter
 * projects are natively buildable out of the box, so they skip the Capacitor
 * onboarding even though the shared release panel drives them.
 */
async function inspectFlutterRelease(
  appPath: string,
  fallbackName: string,
): Promise<NativeReleaseStatus> {
  const flutterExecutable = getFlutterExecutable();
  const environment = resolveAndroidEnvironment();
  const managedToolchain = await inspectManagedAndroidToolchain(appPath);
  const androidPath = path.join(appPath, "android");
  const iosPath = path.join(appPath, "ios");
  const gradleWrapper = firstExisting([
    path.join(
      androidPath,
      process.platform === "win32" ? "gradlew.bat" : "gradlew",
    ),
  ]);
  const javacPath = resolveJdkHomeSafe();
  const [flutterProbe, javaProbe, adbProbe, xcodeProbe] = await Promise.all([
    probeCommand(flutterExecutable, ["--version"], appPath),
    javacPath
      ? probeCommand(
          path.join(javacPath, "bin", executableName("javac")),
          ["-version"],
          appPath,
        )
      : probeCommand(executableName("javac"), ["-version"], appPath),
    environment.adbPath
      ? probeCommand(environment.adbPath, ["version"], appPath)
      : Promise.resolve({ available: false, output: "" }),
    process.platform === "darwin"
      ? probeCommand("xcodebuild", ["-version"], appPath)
      : Promise.resolve({ available: false, output: "" }),
  ]);
  const androidStudioPath = resolveAndroidStudioPath();
  const androidProjectExists = fs.existsSync(androidPath);
  const iosProjectExists = fs.existsSync(iosPath);

  const tools: NativeToolStatus[] = [
    tool({
      id: "flutter",
      label: "Flutter SDK",
      description:
        "Builds, analyzes, tests, and packages the Dart code for mobile and web.",
      requiredForAndroidBuild: true,
      state: flutterProbe.available ? "ready" : "missing",
      version: extractVersion(flutterProbe.output),
      location: flutterExecutable === "flutter" ? null : flutterExecutable,
      remediation: flutterProbe.available
        ? null
        : "Install the Flutter SDK, add it to PATH (or FLUTTER_ROOT), then restart CAIDE.",
    }),
    tool({
      id: "java",
      label: "Java development kit",
      description: "Compiles Android Java/Kotlin code and runs Gradle.",
      requiredForAndroidBuild: true,
      state: javaProbe.available ? "ready" : "missing",
      version: extractVersion(javaProbe.output),
      location: javacPath ?? environment.javaPath,
      remediation: javaProbe.available ? null : platformJdkRemediation(),
    }),
    tool({
      id: "android-sdk",
      label: "Android SDK",
      description: "Provides the compiler, platform tools, and device bridge.",
      requiredForAndroidBuild: true,
      state: environment.sdkPath ? "ready" : "missing",
      location: environment.sdkPath,
      remediation: environment.sdkPath
        ? null
        : "Install the Android SDK or Android Studio, then set ANDROID_SDK_ROOT.",
    }),
    tool({
      id: "android-platform",
      label: "Android platform",
      description: "Contains the Android API used to compile the project.",
      requiredForAndroidBuild: true,
      state: environment.platformVersion ? "ready" : "missing",
      version: environment.platformVersion,
      remediation: environment.platformVersion
        ? null
        : "Install at least one Android SDK Platform in the SDK Manager.",
    }),
    tool({
      id: "android-build-tools",
      label: "Android build tools",
      description: "Creates, aligns, signs, and verifies APK and AAB files.",
      requiredForAndroidBuild: true,
      state:
        environment.buildToolsPath &&
        environment.zipalignPath &&
        environment.apksignerPath
          ? "ready"
          : "missing",
      version: environment.buildToolsVersion,
      location: environment.buildToolsPath,
      remediation: environment.buildToolsPath
        ? "Install a complete Android Build Tools package with zipalign and apksigner."
        : "Install Android SDK Build Tools in the SDK Manager.",
    }),
    tool({
      id: "gradle",
      label: "Gradle wrapper",
      description: "Compiles the generated Android project reproducibly.",
      requiredForAndroidBuild: true,
      state: gradleWrapper ? "ready" : "missing",
      location: gradleWrapper,
      remediation: gradleWrapper
        ? null
        : "Run mobile setup again so CAIDE can generate the Android project.",
    }),
    tool({
      id: "adb",
      label: "Android device bridge",
      description: "Installs an APK on a connected Android phone or emulator.",
      requiredForAndroidBuild: false,
      state: adbProbe.available ? "optional" : "missing",
      version: extractVersion(adbProbe.output),
      location: environment.adbPath,
      remediation: adbProbe.available
        ? null
        : "Install Android SDK Platform Tools to install builds from CAIDE.",
    }),
    tool({
      id: "android-studio",
      label: "Android Studio",
      description:
        "Optional advanced tool for Kotlin or Java code, emulators, profiling, and deep debugging.",
      requiredForAndroidBuild: false,
      state: androidStudioPath ? "optional" : "missing",
      location: androidStudioPath,
      remediation: androidStudioPath
        ? null
        : "Install Android Studio only if you need advanced native development.",
    }),
    tool({
      id: "xcode",
      label: "Xcode",
      description:
        "Apple's required macOS toolchain for iOS signing and distribution.",
      requiredForAndroidBuild: false,
      state:
        process.platform !== "darwin"
          ? "unsupported"
          : xcodeProbe.available
            ? "optional"
            : "missing",
      version: extractVersion(xcodeProbe.output),
      remediation:
        process.platform !== "darwin"
          ? "iOS builds require macOS."
          : xcodeProbe.available
            ? null
            : "Install Xcode from Apple and select its command-line tools.",
    }),
  ];

  const canBuildAndroid =
    androidProjectExists &&
    tools
      .filter((item) => item.requiredForAndroidBuild)
      .every((item) => item.state === "ready");

  return {
    hostPlatform: hostPlatform(),
    platformKind: "flutter",
    capacitorInstalled: true,
    androidProjectExists,
    iosProjectExists,
    canBuildAndroid,
    canOpenAndroidStudio: Boolean(androidStudioPath),
    canOpenXcode: process.platform === "darwin" && xcodeProbe.available,
    app: await readNativeAppInfo(appPath, fallbackName),
    tools,
    artifacts: await collectFlutterArtifacts(appPath),
    managedToolchain,
  };
}

async function collectFlutterArtifacts(
  appPath: string,
): Promise<NativeArtifact[]> {
  const roots = [
    path.join(appPath, "build", "app", "outputs"),
    path.join(appPath, "build", "ios", "ipa"),
  ];
  const artifactPaths = (
    await Promise.all(roots.map((root) => walkArtifacts(root)))
  ).flat();
  const relevantArtifacts = artifactPaths.filter((artifactPath) => {
    const name = path.basename(artifactPath).toLowerCase();
    return (
      name.endsWith(".apk") || name.endsWith(".aab") || name.endsWith(".ipa")
    );
  });
  const artifacts = await Promise.all(
    relevantArtifacts.map(async (artifactPath) =>
      artifactFromPath(artifactPath, await readRecordedChecksum(artifactPath)),
    ),
  );
  return artifacts
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);
}

async function checkGradleDistributionReachable(
  androidPath: string,
): Promise<void> {
  try {
    const propsPath = path.join(
      androidPath,
      "gradle",
      "wrapper",
      "gradle-wrapper.properties",
    );
    const content = fs.readFileSync(propsPath, "utf8");
    const url = content.match(/distributionUrl=(https?:\/\/[^\s]+)/)?.[1];
    if (!url) return;
    const { hostname } = new URL(url);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10_000);
    try {
      const resp = await fetch(`https://${hostname}`, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } finally {
      clearTimeout(id);
    }
  } catch {
    throw new CaideError(
      `Cannot reach the Gradle distribution server. Check your internet connection.`,
      CaideErrorKind.External,
    );
  }
}

function useBinZipInWrapper(androidPath: string): void {
  const propsPath = path.join(
    androidPath,
    "gradle",
    "wrapper",
    "gradle-wrapper.properties",
  );
  try {
    let content = fs.readFileSync(propsPath, "utf8");
    const original = content;
    content = content.replace(/(distributionUrl=.*-)(all)(\.zip)/, "$1bin$3");
    if (content !== original) {
      fs.writeFileSync(propsPath, content, "utf8");
    }
  } catch {
    // best-effort
  }
}

function ensureAndroidLocalProperties(androidPath: string): void {
  const sdkPath = resolveAndroidSdkPath();
  if (!sdkPath) return;
  const propsPath = path.join(androidPath, "local.properties");
  try {
    let content = "";
    let needsWrite = false;
    if (fs.existsSync(propsPath)) {
      content = fs.readFileSync(propsPath, "utf8");
      const original = content;
      if (content.includes("sdk.dir=")) {
        content = content.replace(/sdk\.dir=.*/, `sdk.dir=${sdkPath}`);
      } else {
        content += `\nsdk.dir=${sdkPath}`;
      }
      needsWrite = content !== original;
    } else {
      content = `sdk.dir=${sdkPath}\n`;
      needsWrite = true;
    }
    if (needsWrite) {
      fs.writeFileSync(propsPath, content, "utf8");
    }
  } catch {
    // best-effort
  }
}

function isGradleDistributionCached(androidPath: string): boolean {
  const propsPath = path.join(
    androidPath,
    "gradle",
    "wrapper",
    "gradle-wrapper.properties",
  );
  try {
    const content = fs.readFileSync(propsPath, "utf8");
    const match = content.match(/distributionUrl=.*\/(gradle-[^\s]+\.zip)/);
    if (!match) return false;
    const distName = match[1];
    const gradleUserHome =
      process.env.GRADLE_USER_HOME || path.join(os.homedir(), ".gradle");
    const versionDir = path.join(gradleUserHome, "wrapper", "dists", distName);
    if (!fs.existsSync(versionDir)) return false;
    for (const sub of fs.readdirSync(versionDir)) {
      const subPath = path.join(versionDir, sub);
      if (!fs.statSync(subPath).isDirectory()) continue;
      if (fs.readdirSync(subPath).some((f) => f.endsWith(".zip"))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function syncCapacitorProject(
  appPath: string,
  platform?: "android" | "ios",
  signal?: AbortSignal,
  remoteApiUrl?: string,
): Promise<void> {
  if (!isCapacitorInstalled(appPath)) {
    throw new CaideError(
      "Mobile setup has not been completed for this project.",
      CaideErrorKind.Precondition,
    );
  }
  if (signal?.aborted) {
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
  }
  const distDir = path.join(appPath, "dist");
  // Always rebuild if a remoteApiUrl is provided to ensure it gets baked in
  const webBuildUpToDate =
    !remoteApiUrl &&
    fs.existsSync(distDir) &&
    fs.readdirSync(distDir).length > 0;
  if (!webBuildUpToDate) {
    const env = { ...getPackageManagerCommandEnv() };
    if (remoteApiUrl) {
      env.VITE_API_URL = remoteApiUrl;
    }
    await simpleSpawn({
      command: "npm run build",
      cwd: appPath,
      successMessage: "Web application built successfully",
      errorPrefix: "The web application could not be built",
      timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
      env,
      signal,
    });
  }
  if (signal?.aborted) {
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
  }
  const capSdkPath = resolveAndroidSdkPath();
  await simpleSpawn({
    command: `npx cap sync${platform ? ` ${platform}` : ""}`,
    cwd: appPath,
    successMessage: "Capacitor project synchronized successfully",
    errorPrefix: "The native project could not be synchronized",
    timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
    env: {
      ...getPackageManagerCommandEnv(),
      LANG: "en_US.UTF-8",
      ...(capSdkPath
        ? { ANDROID_HOME: capSdkPath, ANDROID_SDK_ROOT: capSdkPath }
        : {}),
    },
    signal,
  });
  const androidPath = path.join(appPath, "android");
  if (fs.existsSync(androidPath)) {
    useBinZipInWrapper(androidPath);
    ensureAndroidLocalProperties(androidPath);
  }
}

function gradleCommand(androidPath: string, task: string): string {
  const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  if (!fs.existsSync(path.join(androidPath, wrapper.replace(/^\.\//, "")))) {
    throw new CaideError(
      "The Android Gradle wrapper is missing. Run mobile setup again.",
      CaideErrorKind.Precondition,
    );
  }
  return `${wrapper} ${task}`;
}

async function newestFile(
  root: string,
  predicate: (filePath: string) => boolean,
): Promise<string> {
  const files = (await walkArtifacts(root)).filter(predicate);
  if (files.length === 0) {
    throw new CaideError(
      "The native compiler finished but CAIDE could not locate the expected output file.",
      CaideErrorKind.External,
    );
  }
  const withStats = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      modified: (await fsp.stat(filePath)).mtimeMs,
    })),
  );
  withStats.sort((a, b) => b.modified - a.modified);
  return withStats[0].filePath;
}

function signingEnvironment(
  signing: AndroidSigningCredentials,
): NodeJS.ProcessEnv {
  return {
    ...buildManagedToolchainEnvironment(getPackageManagerCommandEnv()),
    CAIDE_ANDROID_STORE_PASSWORD: signing.storePassword,
    CAIDE_ANDROID_KEY_PASSWORD: signing.keyPassword,
  };
}

async function verifySigningCredentials(
  appPath: string,
  environment: AndroidEnvironment,
  signing: AndroidSigningCredentials,
): Promise<void> {
  if (!fs.existsSync(signing.keystorePath)) {
    throw new CaideError(
      "The selected signing-key file no longer exists.",
      CaideErrorKind.NotFound,
    );
  }
  await runCommand(
    environment.keytoolPath,
    [
      "-list",
      "-keystore",
      signing.keystorePath,
      "-alias",
      signing.keyAlias,
      "-storepass:env",
      "CAIDE_ANDROID_STORE_PASSWORD",
    ],
    {
      cwd: appPath,
      label: "Validating Android signing key",
      env: signingEnvironment(signing),
    },
  );
}

function artifactFileStem(app: NativeAppInfo): string {
  return sanitizeArtifactName(
    [app.name, app.versionName].filter(Boolean).join("-"),
  );
}

const GRADLE_LOCK_TIMEOUT_MS = 300_000;

function gradleProgressTask(line: string): string | null {
  const m = line.match(/^>\s+(Configure\s+(project|root)\s*|Task\s+:\S+\s+)/);
  if (!m) return null;
  return line.replace(/^\s*>\s*/, "").trim();
}

function platformJdkRemediation(): string {
  const cmds: Record<string, string> = {
    linux:
      process.platform === "linux"
        ? (() => {
            if (fs.existsSync("/etc/arch-release"))
              return "sudo pacman -S jdk21-openjdk";
            if (fs.existsSync("/etc/debian_version"))
              return "sudo apt install openjdk-21-jdk";
            if (fs.existsSync("/etc/fedora-release"))
              return "sudo dnf install java-21-openjdk-devel";
            return "Install a JDK 21 package for your distro";
          })()
        : "Install a JDK 21 package for your distro",
    darwin: "brew install openjdk@21",
    win32:
      "Download from https://adoptium.net/ or run: winget install EclipseAdoptium.Temurin.21.JDK",
  };
  return `Install a full JDK (with javac). ${cmds[process.platform] || cmds.linux} Then set JAVA_HOME.`;
}

function resolveJdkHomeSafe(): string | undefined {
  const managedJdkHome = getManagedJdkHome();
  if (
    fs.existsSync(path.join(managedJdkHome, "bin", executableName("javac")))
  ) {
    return managedJdkHome;
  }
  const candidate = process.env.CAIDE_JAVA_HOME ?? process.env.JAVA_HOME;
  if (
    candidate &&
    fs.existsSync(path.join(candidate, "bin", executableName("javac")))
  )
    return candidate;
  const jvmDir = "/usr/lib/jvm";
  if (process.platform === "darwin") {
    const homebrew = "/opt/homebrew/opt/openjdk@21";
    if (fs.existsSync(path.join(homebrew, "bin", executableName("javac"))))
      return homebrew;
  }
  if (fs.existsSync(jvmDir)) {
    const entries = fs.readdirSync(jvmDir).sort().reverse();
    for (const entry of entries) {
      const full = path.join(jvmDir, entry);
      if (
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "bin", executableName("javac")))
      )
        return full;
    }
  }
  return candidate;
}

function resolveJdkHome(): string {
  const found = resolveJdkHomeSafe();
  if (found) return found;
  const systemJava = process.env.JAVA_HOME || "/usr/lib/jvm/java-21-openjdk";
  throw new CaideError(
    `A full JDK (with javac) was not found at ${systemJava}. ${platformJdkRemediation()}`,
    CaideErrorKind.Precondition,
  );
}

async function gradleDaemonStop(androidPath: string): Promise<void> {
  try {
    await simpleSpawn({
      command: `${gradleCommand(androidPath, "")} --stop`,
      cwd: androidPath,
      successMessage: "Gradle daemon stopped",
      errorPrefix: "Failed to stop Gradle daemon",
      timeoutMs: 15_000,
      env: buildManagedToolchainEnvironment(getPackageManagerCommandEnv()),
    });
  } catch {
    // best-effort — daemon may not be running
  }
}

async function gradleSpawn(
  androidPath: string,
  task: string,
  successMessage: string,
  errorPrefix: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<void> {
  await gradleDaemonStop(androidPath);
  const offline = isGradleDistributionCached(androidPath);
  const command = offline
    ? `${gradleCommand(androidPath, task)} --offline`
    : gradleCommand(androidPath, task);
  const javaHome = resolveJdkHome();
  ensureAndroidLocalProperties(androidPath);
  const sdkPath = resolveAndroidSdkPath();
  const env: NodeJS.ProcessEnv = {
    ...buildManagedToolchainEnvironment(getPackageManagerCommandEnv()),
    GRADLE_OPTS: [
      `-Dorg.gradle.wrapper.timeout=${GRADLE_LOCK_TIMEOUT_MS}`,
      `-Dorg.gradle.internal.wrapper.networkTimeout=${NATIVE_BUILD_TIMEOUT_MS}`,
      "-Xmx2g",
      "-Dorg.gradle.java.installations.auto-detect=false",
      `-Dorg.gradle.java.installations.paths=${javaHome}`,
    ].join(" "),
  };
  env.JAVA_HOME = javaHome;
  if (sdkPath) {
    env.ANDROID_HOME = sdkPath;
    env.ANDROID_SDK_ROOT = sdkPath;
  }
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await simpleSpawn({
        command,
        cwd: androidPath,
        successMessage,
        errorPrefix:
          attempt > 0 ? `${errorPrefix} (retry ${attempt})` : errorPrefix,
        timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
        signal,
        env,
        onStdout: onProgress
          ? (chunk) => {
              for (const line of chunk.split("\n")) {
                const taskLine = gradleProgressTask(line);
                if (taskLine) onProgress(taskLine);
              }
            }
          : undefined,
      });
      return;
    } catch (error) {
      const isLockTimeout =
        error instanceof Error &&
        error.message?.includes("Timeout of") &&
        error.message?.includes("waiting for exclusive access");
      if (isLockTimeout && attempt < maxRetries && !signal?.aborted) {
        await new Promise((resolve) =>
          setTimeout(resolve, (attempt + 1) * 5_000),
        );
        continue;
      }
      throw error;
    }
  }
}

function withProgressHeartbeat(
  onProgress: BuildProgressCallback | undefined,
  startPercent: number,
  endPercent: number,
  phase: "gradle-compile" | "signing" | "packaging",
  label: string,
  signal?: AbortSignal,
  gradleTaskRef?: { current: string },
): () => void {
  const startTime = Date.now();
  const rampDurationMs = 25 * 60 * 1000;
  const interval = setInterval(() => {
    if (signal?.aborted) {
      clearInterval(interval);
      return;
    }
    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const taskMsg = gradleTaskRef?.current
        ? ` — ${gradleTaskRef.current}`
        : "";
      onProgress({
        phase,
        percent: Math.min(
          endPercent - 1,
          startPercent +
            Math.min(elapsed / rampDurationMs, 1) * (endPercent - startPercent),
        ),
        message: `${label}${taskMsg}${elapsed > 30000 ? " (this may take a few minutes)" : ""}...`,
      });
    }
  }, 5000);
  return () => clearInterval(interval);
}

export type BuildProgressCallback = (progress: {
  phase:
    | "web-build"
    | "capacitor-sync"
    | "gradle-compile"
    | "signing"
    | "packaging"
    | "done";
  percent: number;
  message: string;
}) => void;

/**
 * Build a Flutter Android artifact (debug APK, release APK, or Play AAB) with
 * the Flutter toolchain. Flutter's default template signs release builds with
 * the debug signing config, so no keystore is required here.
 */
async function buildFlutterArtifact(
  appPath: string,
  target: AndroidBuildTarget,
  onProgress?: BuildProgressCallback,
  signal?: AbortSignal,
): Promise<NativeArtifact> {
  const flutter = getFlutterExecutable();
  const args = [
    ...(target === "debug-apk"
      ? ["build", "apk", "--debug"]
      : target === "release-apk"
        ? ["build", "apk", "--release"]
        : ["build", "appbundle", "--release"]),
    ...getDartDefineFromFileArgs(appPath),
  ];
  const label =
    target === "debug-apk"
      ? "Building Flutter debug APK"
      : target === "release-apk"
        ? "Building Flutter release APK"
        : "Building Flutter release App Bundle";

  onProgress?.({
    phase: "gradle-compile",
    percent: 10,
    message: `${label}...`,
  });
  if (signal?.aborted)
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);

  const stopHeartbeat = withProgressHeartbeat(
    onProgress,
    10,
    85,
    "gradle-compile",
    label,
    signal,
    { current: "" },
  );
  try {
    await runCommand(flutter, args, {
      cwd: appPath,
      label,
      timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
      signal,
    });
  } finally {
    stopHeartbeat();
  }

  const artifactPath =
    target === "debug-apk"
      ? path.join(
          appPath,
          "build",
          "app",
          "outputs",
          "flutter-apk",
          "app-debug.apk",
        )
      : target === "release-apk"
        ? path.join(
            appPath,
            "build",
            "app",
            "outputs",
            "flutter-apk",
            "app-release.apk",
          )
        : path.join(
            appPath,
            "build",
            "app",
            "outputs",
            "bundle",
            "release",
            "app-release.aab",
          );
  if (!fs.existsSync(artifactPath)) {
    throw new CaideError(
      `Flutter build finished but the artifact was not found at ${artifactPath}`,
      CaideErrorKind.External,
    );
  }

  onProgress?.({
    phase: "packaging",
    percent: 90,
    message: "Computing checksum...",
  });
  const artifact = await artifactFromPath(
    artifactPath,
    await recordArtifactChecksum(artifactPath),
  );
  onProgress?.({ phase: "done", percent: 100, message: "Build ready" });
  return artifact;
}

/**
 * Build a signed Flutter iOS archive (requires macOS + Xcode + signing
 * configured in the iOS project).
 */
export async function buildFlutterIpa(
  appPath: string,
  onProgress?: BuildProgressCallback,
  signal?: AbortSignal,
): Promise<NativeArtifact> {
  if (process.platform !== "darwin") {
    throw new CaideError(
      "iOS builds require macOS with Xcode.",
      CaideErrorKind.Precondition,
    );
  }
  const flutter = getFlutterExecutable();
  onProgress?.({
    phase: "gradle-compile",
    percent: 10,
    message: "Building Flutter iOS archive...",
  });
  if (signal?.aborted)
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);

  const stopHeartbeat = withProgressHeartbeat(
    onProgress,
    10,
    85,
    "gradle-compile",
    "Building Flutter iOS archive",
    signal,
    { current: "" },
  );
  try {
    await runCommand(
      flutter,
      ["build", "ipa", ...getDartDefineFromFileArgs(appPath)],
      {
        cwd: appPath,
        label: "Building Flutter iOS archive",
        timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
        signal,
      },
    );
  } finally {
    stopHeartbeat();
  }

  const ipaDir = path.join(appPath, "build", "ios", "ipa");
  const ipaPath = await newestFile(ipaDir, (filePath) =>
    filePath.toLowerCase().endsWith(".ipa"),
  );
  onProgress?.({
    phase: "packaging",
    percent: 90,
    message: "Computing checksum...",
  });
  const artifact = await artifactFromPath(
    ipaPath,
    await recordArtifactChecksum(ipaPath),
  );
  onProgress?.({ phase: "done", percent: 100, message: "iOS archive ready" });
  return artifact;
}

/**
 * Ensure a Flutter project's dependencies are resolved (like `flutter pub
 * get`), mirroring the Capacitor sync step for Flutter apps.
 */
export async function syncFlutterProject(
  appPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const flutter = getFlutterExecutable();
  await runCommand(flutter, ["pub", "get"], {
    cwd: appPath,
    label: "Resolving Flutter dependencies",
    timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
    signal,
  });
}

export async function buildAndroidArtifact(
  appPath: string,
  fallbackName: string,
  target: AndroidBuildTarget,
  signing: AndroidSigningCredentials | null,
  onProgress?: BuildProgressCallback,
  signal?: AbortSignal,
  releaseStatus?: NativeReleaseStatus,
  remoteApiUrl?: string,
): Promise<NativeArtifact> {
  if (isFlutterApp(appPath)) {
    void fallbackName;
    void releaseStatus;
    void remoteApiUrl;
    return buildFlutterArtifact(appPath, target, onProgress, signal);
  }

  const status =
    releaseStatus ?? (await inspectNativeRelease(appPath, fallbackName));
  if (!status.canBuildAndroid) {
    const missing = status.tools
      .filter((item) => item.requiredForAndroidBuild && item.state !== "ready")
      .map((item) => item.label)
      .join(", ");
    throw new CaideError(
      `CAIDE cannot build Android yet. Fix the missing environment items: ${missing || "unknown requirement"}.`,
      CaideErrorKind.Precondition,
    );
  }
  if (target !== "debug-apk" && !signing) {
    throw new CaideError(
      "A signing key is required for release APK and Play Store AAB builds.",
      CaideErrorKind.Precondition,
    );
  }

  const environment = resolveAndroidEnvironment();
  const androidPath = path.join(appPath, "android");
  if (!isGradleDistributionCached(androidPath) && fs.existsSync(androidPath)) {
    await checkGradleDistributionReachable(androidPath);
  }
  const outputDirectory = path.join(
    androidPath,
    "app",
    "build",
    "outputs",
    "caide",
  );
  await fsp.mkdir(outputDirectory, { recursive: true });

  onProgress?.({
    phase: "web-build",
    percent: 5,
    message: "Building web application...",
  });
  if (signal?.aborted)
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
  await syncCapacitorProject(appPath, "android", signal, remoteApiUrl);
  onProgress?.({
    phase: "capacitor-sync",
    percent: 25,
    message: "Capacitor project synchronized",
  });

  const stem = artifactFileStem(status.app);
  const buildStamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  if (target === "debug-apk") {
    const lastGradleTask: { current: string } = { current: "" };
    onProgress?.({
      phase: "gradle-compile",
      percent: 30,
      message: "Compiling debug APK with Gradle...",
    });
    if (signal?.aborted)
      throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
    const stopDebugHeartbeat = withProgressHeartbeat(
      onProgress,
      30,
      65,
      "gradle-compile",
      "Compiling debug APK",
      signal,
      lastGradleTask,
    );
    try {
      await gradleSpawn(
        androidPath,
        "assembleDebug",
        "Debug APK compiled successfully",
        "The debug APK could not be compiled",
        signal,
        (m) => {
          lastGradleTask.current = m;
        },
      );
    } finally {
      stopDebugHeartbeat();
    }
    onProgress?.({
      phase: "gradle-compile",
      percent: 70,
      message: "Gradle compilation complete, packaging APK...",
    });
    const source = await newestFile(
      path.join(androidPath, "app", "build", "outputs", "apk", "debug"),
      (filePath) => {
        const lower = filePath.toLowerCase();
        return (
          lower.endsWith(".apk") &&
          !lower.includes("-armeabi") &&
          !lower.includes("-x86")
        );
      },
    );
    const destination = path.join(
      outputDirectory,
      `${stem}-${buildStamp}-debug.apk`,
    );
    await fsp.copyFile(source, destination);
    onProgress?.({
      phase: "packaging",
      percent: 90,
      message: "Computing checksum...",
    });
    const artifact = await artifactFromPath(
      destination,
      await recordArtifactChecksum(destination),
    );
    onProgress?.({ phase: "done", percent: 100, message: "Debug APK ready" });
    return artifact;
  }

  const releaseSigning = signing as AndroidSigningCredentials;
  await verifySigningCredentials(appPath, environment, releaseSigning);

  if (target === "release-apk") {
    if (!environment.zipalignPath || !environment.apksignerPath) {
      throw new CaideError(
        "Android Build Tools are incomplete. CAIDE needs zipalign and apksigner to create a signed APK.",
        CaideErrorKind.Precondition,
      );
    }
    const lastGradleTaskRelease: { current: string } = { current: "" };
    onProgress?.({
      phase: "gradle-compile",
      percent: 30,
      message: "Compiling release APK with Gradle...",
    });
    if (signal?.aborted)
      throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
    const stopReleaseHeartbeat = withProgressHeartbeat(
      onProgress,
      30,
      65,
      "gradle-compile",
      "Compiling release APK",
      signal,
      lastGradleTaskRelease,
    );
    try {
      await gradleSpawn(
        androidPath,
        "assembleRelease",
        "Release APK compiled successfully",
        "The release APK could not be compiled",
        signal,
        (m) => {
          lastGradleTaskRelease.current = m;
        },
      );
    } finally {
      stopReleaseHeartbeat();
    }
    const source = await newestFile(
      path.join(androidPath, "app", "build", "outputs", "apk", "release"),
      (filePath) =>
        filePath.toLowerCase().endsWith(".apk") &&
        !filePath.includes(`${path.sep}caide${path.sep}`),
    );
    const aligned = path.join(
      outputDirectory,
      `${stem}-${buildStamp}-release-aligned.apk`,
    );
    const destination = path.join(
      outputDirectory,
      `${stem}-${buildStamp}-release.apk`,
    );
    onProgress?.({
      phase: "signing",
      percent: 70,
      message: "Aligning and signing release APK...",
    });
    if (signal?.aborted)
      throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
    await runCommand(
      environment.zipalignPath,
      ["-f", "-v", "4", source, aligned],
      { cwd: appPath, label: "Aligning release APK", signal },
    );
    try {
      await runCommand(
        environment.apksignerPath,
        [
          "sign",
          "--ks",
          releaseSigning.keystorePath,
          "--ks-key-alias",
          releaseSigning.keyAlias,
          "--ks-pass",
          "env:CAIDE_ANDROID_STORE_PASSWORD",
          "--key-pass",
          "env:CAIDE_ANDROID_KEY_PASSWORD",
          "--out",
          destination,
          aligned,
        ],
        {
          cwd: appPath,
          label: "Signing release APK",
          env: signingEnvironment(releaseSigning),
          signal,
        },
      );
      await runCommand(
        environment.apksignerPath,
        ["verify", "--verbose", destination],
        { cwd: appPath, label: "Verifying release APK", signal },
      );
    } finally {
      await fsp.rm(aligned, { force: true });
    }
    onProgress?.({
      phase: "packaging",
      percent: 90,
      message: "Computing checksum...",
    });
    const releaseApk = await artifactFromPath(
      destination,
      await recordArtifactChecksum(destination),
    );
    onProgress?.({ phase: "done", percent: 100, message: "Signed APK ready" });
    return releaseApk;
  }

  onProgress?.({
    phase: "gradle-compile",
    percent: 30,
    message: "Compiling Android App Bundle with Gradle...",
  });
  if (signal?.aborted)
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
  const stopBundleHeartbeat = withProgressHeartbeat(
    onProgress,
    30,
    62,
    "gradle-compile",
    "Compiling App Bundle",
    signal,
  );
  try {
    await gradleSpawn(
      androidPath,
      "bundleRelease",
      "Android App Bundle compiled successfully",
      "The Android App Bundle could not be compiled",
      signal,
    );
  } finally {
    stopBundleHeartbeat();
  }
  onProgress?.({
    phase: "gradle-compile",
    percent: 65,
    message: "Bundle compiled, signing...",
  });
  const source = await newestFile(
    path.join(androidPath, "app", "build", "outputs", "bundle", "release"),
    (filePath) => filePath.toLowerCase().endsWith(".aab"),
  );
  const destination = path.join(
    outputDirectory,
    `${stem}-${buildStamp}-release.aab`,
  );
  await fsp.copyFile(source, destination);
  if (signal?.aborted)
    throw new CaideError("Build cancelled", CaideErrorKind.UserCancelled);
  await runCommand(
    environment.jarsignerPath,
    [
      "-sigalg",
      "SHA256withRSA",
      "-digestalg",
      "SHA-256",
      "-keystore",
      releaseSigning.keystorePath,
      "-storepass:env",
      "CAIDE_ANDROID_STORE_PASSWORD",
      "-keypass:env",
      "CAIDE_ANDROID_KEY_PASSWORD",
      destination,
      releaseSigning.keyAlias,
    ],
    {
      cwd: appPath,
      label: "Signing Android App Bundle",
      env: signingEnvironment(releaseSigning),
      signal,
    },
  );
  await runCommand(
    environment.jarsignerPath,
    ["-verify", "-verbose", "-certs", destination],
    { cwd: appPath, label: "Verifying Android App Bundle", signal },
  );
  onProgress?.({
    phase: "signing",
    percent: 85,
    message: "Bundle signed and verified",
  });
  onProgress?.({
    phase: "packaging",
    percent: 90,
    message: "Computing checksum...",
  });
  const aab = await artifactFromPath(
    destination,
    await recordArtifactChecksum(destination),
  );
  onProgress?.({
    phase: "done",
    percent: 100,
    message: "Android App Bundle ready",
  });
  return aab;
}

function buildDistinguishedName(input: CreateAndroidKeystoreParams): string {
  const entries = [
    ["CN", input.commonName],
    ["OU", input.organizationalUnit],
    ["O", input.organization],
    ["L", input.city],
    ["ST", input.state],
    ["C", input.countryCode.toUpperCase()],
  ]
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}=${escapeDistinguishedNameValue(value)}`);
  return entries.join(", ");
}

export async function createAndroidKeystore(
  appPath: string,
  destination: string,
  input: CreateAndroidKeystoreParams,
): Promise<void> {
  if (fs.existsSync(destination)) {
    throw new CaideError(
      "A file already exists at the selected signing-key location.",
      CaideErrorKind.Validation,
    );
  }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const environment = resolveAndroidEnvironment();
  await runCommand(
    environment.keytoolPath,
    [
      "-genkeypair",
      "-noprompt",
      "-keystore",
      destination,
      "-storetype",
      "JKS",
      "-storepass:env",
      "CAIDE_ANDROID_STORE_PASSWORD",
      "-keypass:env",
      "CAIDE_ANDROID_KEY_PASSWORD",
      "-alias",
      input.keyAlias,
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      String(input.validityYears * 365),
      "-dname",
      buildDistinguishedName(input),
    ],
    {
      cwd: appPath,
      label: "Creating Android signing key",
      env: {
        ...getPackageManagerCommandEnv(),
        CAIDE_ANDROID_STORE_PASSWORD: input.storePassword,
        CAIDE_ANDROID_KEY_PASSWORD: input.keyPassword,
      },
    },
  );
}

function isPathInside(parent: string, candidate: string): boolean {
  try {
    const resolvedParent = fs.realpathSync(parent);
    const resolvedCandidate = fs.realpathSync(candidate);
    const relative = path.relative(resolvedParent, resolvedCandidate);
    return (
      relative.length > 0 &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  } catch {
    return false;
  }
}

export function assertNativeArtifactPath(
  appPath: string,
  artifactPath: string,
): void {
  if (!fs.existsSync(artifactPath)) {
    throw new CaideError(
      "The requested native artifact no longer exists.",
      CaideErrorKind.NotFound,
    );
  }
  if (
    !isPathInside(appPath, artifactPath) ||
    !inferArtifactKind(artifactPath)
  ) {
    throw new CaideError(
      "The requested artifact is outside this CAIDE project.",
      CaideErrorKind.Validation,
    );
  }
}

export async function installAndroidArtifact(
  appPath: string,
  artifactPath: string,
): Promise<void> {
  if (!artifactPath.toLowerCase().endsWith(".apk")) {
    throw new CaideError(
      "Android App Bundles cannot be installed directly. Build an APK for device testing.",
      CaideErrorKind.Validation,
    );
  }
  const environment = resolveAndroidEnvironment();
  if (!environment.adbPath) {
    throw new CaideError(
      "ADB was not found. Install Android SDK Platform Tools before installing on a device.",
      CaideErrorKind.Precondition,
    );
  }
  assertNativeArtifactPath(appPath, artifactPath);
  try {
    await runCommand(environment.adbPath, ["install", "-r", artifactPath], {
      cwd: appPath,
      label: "Installing APK on connected Android device",
      timeoutMs: NATIVE_BUILD_TIMEOUT_MS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("INSTALL_FAILED_USER_RESTRICTED") ||
      msg.includes("Install canceled by user")
    ) {
      throw new CaideError(
        "Install rejected by device. On your Android device:\n" +
          "1. Unlock the screen and check for a confirmation prompt\n" +
          '2. Enable "Install via USB" in Developer Options\n' +
          '3. Disable "Verify apps via USB" in Developer Options\n' +
          "4. Reconnect the USB cable and try again",
        CaideErrorKind.External,
      );
    }
    throw err;
  }
}
