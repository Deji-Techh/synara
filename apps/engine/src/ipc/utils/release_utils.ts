import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { simpleSpawn } from "./simpleSpawn";
import { getPackageManagerCommandEnv } from "./socket_firewall";
import {
  isCapacitorInstalled,
  buildAndroidArtifact,
  inspectNativeRelease,
} from "../services/native_release_service";
import type {
  BuildTarget,
  BuildResult,
  BuildLog,
  DependencyDiagnostic,
  VerificationResult,
  VerificationIssue,
} from "../types/release";

export function appBuildDir(appPath: string): string {
  return path.join(appPath, "dist");
}

export function capacitorDir(appPath: string): string {
  return path.join(appPath, "android");
}

export function iosDir(appPath: string): string {
  return path.join(appPath, "ios");
}

export function keystoreDir(appPath: string): string {
  return path.join(appPath, "android", "app");
}

function makeLog(
  target: BuildTarget,
  status: BuildLog["status"],
  message: string,
  details?: string,
): BuildLog {
  return {
    id: `${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    status,
    message,
    timestamp: Date.now(),
    details,
  };
}

export async function buildWebApp(appPath: string): Promise<BuildResult> {
  const logs: BuildLog[] = [];
  logs.push(makeLog("web", "running", "Building production web bundle..."));

  try {
    await simpleSpawn({
      command: "npm run build",
      cwd: appPath,
      env: {
        ...getPackageManagerCommandEnv(),
        CAPACITOR_BUILD: "true",
      },
      successMessage: "Web build complete",
      errorPrefix: "Web build failed",
    });
    logs.push(makeLog("web", "success", "Production web build completed"));
    return {
      success: true,
      logs,
      outputPath: appBuildDir(appPath),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(makeLog("web", "failed", "Web build failed", message));
    return { success: false, logs };
  }
}

export async function syncCapacitor(appPath: string): Promise<BuildResult> {
  const logs: BuildLog[] = [];
  logs.push(
    makeLog(
      "android-project",
      "running",
      "Syncing Capacitor Android project...",
    ),
  );

  try {
    await simpleSpawn({
      command: "npx cap sync android",
      cwd: appPath,
      successMessage: "Capacitor sync complete",
      errorPrefix: "Capacitor sync failed",
    });
    logs.push(
      makeLog(
        "android-project",
        "success",
        "Android project generated at android/",
      ),
    );
    return { success: true, logs, outputPath: capacitorDir(appPath) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(
      makeLog("android-project", "failed", "Capacitor sync failed", message),
    );
    return { success: false, logs };
  }
}

export async function buildAndroidApkDebug(
  appPath: string,
): Promise<BuildResult> {
  const logs: BuildLog[] = [];

  logs.push(makeLog("apk-debug", "running", "Building debug APK..."));

  try {
    const appName = await getAppName(appPath);
    const artifact = await buildAndroidArtifact(
      appPath,
      appName,
      "debug-apk",
      null,
    );
    logs.push(
      makeLog("apk-debug", "success", `Debug APK built at ${artifact.path}`),
    );
    return { success: true, logs, outputPath: artifact.path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(
      makeLog("apk-debug", "failed", "Debug APK build failed", message),
    );
    return { success: false, logs };
  }
}

export async function checkDependencies(
  appPath: string,
): Promise<DependencyDiagnostic[]> {
  const diagnostics: DependencyDiagnostic[] = [];

  const hasCapacitor = isCapacitorInstalled(appPath);
  diagnostics.push({
    name: "@capacitor/core",
    version: "latest",
    isInstalled: hasCapacitor,
    isOptional: false,
    message: hasCapacitor ? undefined : "Capacitor not detected",
  });

  diagnostics.push({
    name: "@capacitor/android",
    version: "latest",
    isInstalled: hasCapacitor,
    isOptional: false,
    message: hasCapacitor ? undefined : "Android platform not added",
  });

  try {
    const status = await inspectNativeRelease(appPath, "app");
    const sdkTool = status.tools.find((t) => t.id === "android-sdk");
    const javaTool = status.tools.find((t) => t.id === "java");
    const gradleTool = status.tools.find((t) => t.id === "gradle");

    diagnostics.push({
      name: "Android SDK",
      version: "34+",
      isInstalled: sdkTool?.state === "ready",
      isOptional: false,
      message: sdkTool?.remediation ?? undefined,
    });

    diagnostics.push({
      name: "Node.js",
      version: ">=20",
      isInstalled: true,
      isOptional: false,
    });

    diagnostics.push({
      name: "Gradle",
      version: "8.x",
      isInstalled: gradleTool?.state === "ready",
      isOptional: false,
      message: gradleTool?.remediation ?? undefined,
    });

    diagnostics.push({
      name: "Java JDK",
      version: "17+",
      isInstalled: javaTool?.state === "ready",
      isOptional: false,
      message: javaTool?.remediation ?? undefined,
    });
  } catch {
    diagnostics.push({
      name: "Android SDK",
      version: "34+",
      isInstalled: false,
      isOptional: false,
      message: "Could not probe environment",
    });
    diagnostics.push({
      name: "Node.js",
      version: ">=20",
      isInstalled: true,
      isOptional: false,
    });
  }

  return diagnostics;
}

export async function verifyApp(
  appPath: string,
  files: string[],
): Promise<VerificationResult> {
  const issues: VerificationIssue[] = [];

  for (const file of files) {
    const filePath = path.join(appPath, file);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (
      /\bsk-[a-zA-Z0-9_-]{24,}\b/.test(content) ||
      /\b(?:api[_-]?key|secret|access[_-]?token|password)\b\s*[:=]\s*["'][^"'\n]{8,}["']/i.test(
        content,
      )
    ) {
      issues.push({
        category: "secret-detection",
        severity: "error",
        message: `Possible secret/API key found in ${file}`,
        file,
      });
    }

    if (/dangerouslySetInnerHTML\s*=/.test(content)) {
      issues.push({
        category: "security",
        severity: "warning",
        message: "Review dangerouslySetInnerHTML usage for unsanitized content",
        file,
      });
    }

    if (
      /target=["']_blank["']/i.test(content) &&
      !/rel=["'][^"']*(?:noopener|noreferrer)/i.test(content)
    ) {
      issues.push({
        category: "security",
        severity: "warning",
        message:
          'External links opened in a new tab need rel="noopener noreferrer"',
        file,
      });
    }

    if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(content)) {
      issues.push({
        category: "accessibility",
        severity: "warning",
        message: "Image element is missing alternative text",
        file,
      });
    }

    if (/<(?:div|span)\b[^>]*\bonClick\s*=/i.test(content)) {
      issues.push({
        category: "ux-flow",
        severity: "warning",
        message:
          "Click handler on a non-interactive element may break keyboard navigation",
        file,
      });
    }

    if (/\btransition-all\b/.test(content)) {
      issues.push({
        category: "ui-quality",
        severity: "info",
        message:
          "Avoid transition-all; animate explicit compositor-safe properties",
        file,
      });
    }

    if (/text-\[(?:[0-9]|1[01])px\]/.test(content)) {
      issues.push({
        category: "accessibility",
        severity: "warning",
        message:
          "Text below 12px can become unreadable on compact mobile screens",
        file,
      });
    }

    if (
      /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{100000,}/.test(
        content,
      )
    ) {
      issues.push({
        category: "performance",
        severity: "warning",
        message:
          "Large inline image increases startup and bundle cost; use an optimized asset",
        file,
      });
    }

    if (
      file.endsWith(".tsx") &&
      /import\s+\{[^}]*\}\s+from\s['"][^'"]+['"];?\s*$/.test(content)
    ) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/overflow-x\s*:\s*(auto|scroll)/i.test(lines[i])) {
          issues.push({
            category: "unsupported-api",
            severity: "warning",
            message: `Horizontal overflow scroll in ${file}:${i + 1}`,
            file,
            line: i + 1,
          });
        }
      }
    }

    if (file === "package.json") {
      const pkg = JSON.parse(content);
      const totalSize = JSON.stringify(pkg).length;
      if (totalSize > 100_000) {
        issues.push({
          category: "oversized-assets",
          severity: "warning",
          message: `package.json is ${(totalSize / 1024).toFixed(1)}KB`,
          file,
        });
      }
    }
  }

  return {
    passed: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

export async function detectPwaCapability(appPath: string): Promise<boolean> {
  try {
    const files = await fs.readdir(appPath);
    return (
      files.some((f) => f.includes("service-worker")) ||
      files.some((f) => f.includes("manifest"))
    );
  } catch {
    return false;
  }
}

export async function buildAndroidApkRelease(
  appPath: string,
): Promise<BuildResult> {
  const logs: BuildLog[] = [];
  const androidDir = capacitorDir(appPath);
  const androidProjectExists = fsSync.existsSync(path.join(androidDir, "app"));

  if (!androidProjectExists) {
    logs.push(
      makeLog(
        "apk-signed",
        "failed",
        "Android project not found. Run mobile setup first.",
      ),
    );
    return { success: false, logs };
  }

  logs.push(
    makeLog(
      "apk-signed",
      "running",
      "Building release APK via native pipeline...",
    ),
  );

  try {
    await simpleSpawn({
      command: "./gradlew assembleRelease",
      cwd: androidDir,
      successMessage: "Release APK compiled",
      errorPrefix: "Release APK build failed",
    });
    const apkPath = path.join(
      androidDir,
      "app",
      "build",
      "outputs",
      "apk",
      "release",
    );
    logs.push(
      makeLog(
        "apk-signed",
        "success",
        `Release APK built at ${apkPath} (requires signing for distribution)`,
      ),
    );
    return { success: true, logs, outputPath: apkPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(
      makeLog("apk-signed", "failed", "Release APK build failed", message),
    );
    return { success: false, logs };
  }
}

export async function buildAndroidAabRelease(
  appPath: string,
): Promise<BuildResult> {
  const logs: BuildLog[] = [];
  const androidDir = capacitorDir(appPath);
  const androidProjectExists = fsSync.existsSync(path.join(androidDir, "app"));

  if (!androidProjectExists) {
    logs.push(
      makeLog(
        "aab-signed",
        "failed",
        "Android project not found. Run mobile setup first.",
      ),
    );
    return { success: false, logs };
  }

  logs.push(
    makeLog("aab-signed", "running", "Building AAB via native pipeline..."),
  );

  try {
    await simpleSpawn({
      command: "./gradlew bundleRelease",
      cwd: androidDir,
      successMessage: "AAB compiled",
      errorPrefix: "AAB build failed",
    });
    const aabPath = path.join(
      androidDir,
      "app",
      "build",
      "outputs",
      "bundle",
      "release",
    );
    logs.push(
      makeLog(
        "aab-signed",
        "success",
        `AAB built at ${aabPath} (requires signing for distribution)`,
      ),
    );
    return { success: true, logs, outputPath: aabPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(makeLog("aab-signed", "failed", "AAB build failed", message));
    return { success: false, logs };
  }
}

export async function getAppName(appPath: string): Promise<string> {
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(appPath, "package.json"), "utf8"),
    );
    return pkg.name || "app";
  } catch {
    return "app";
  }
}
