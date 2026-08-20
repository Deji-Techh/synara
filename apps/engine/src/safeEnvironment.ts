// FILE: src/safeEnvironment.ts
// Purpose: Builds a safe, minimal environment for spawning Flutter child processes.
// This prevents E2BIG errors by whitelisting only essential env vars instead of
// inheriting the entire process.env (which can exceed Linux's 128KB execve limit).

import fs from "node:fs";
import path from "node:path";

/**
 * Build a minimal, safe environment for Flutter child processes.
 * Only whitelists essential variables to prevent E2BIG spawn errors.
 */
export function safeFlutterEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const ALLOWED_KEYS = [
    // System essentials
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    // Flutter SDK
    "FLUTTER_SDK_DIR",
    "FLUTTER_SDK_BIN",
    "FLUTTER_ROOT",
    "DART_SDK",
    "PUB_CACHE",
    // Android SDK
    "ANDROID_HOME",
    "ANDROID_SDK_ROOT",
    // Java
    "JAVA_HOME",
    // Xcode/iOS
    "DEVELOPER_DIR",
    // Chrome for web preview
    "CHROME_EXECUTABLE",
    "PUPPETEER_EXECUTABLE_PATH",
    // Display (needed for some GUI operations)
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    // SSH (for git operations)
    "SSH_AUTH_SOCK",
  ];

  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_KEYS) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // Inject managed Flutter bin if installed (so child inherits without host PATH)
  // Use lazy require to avoid bundling electron-dependent code into server
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const managed =
      require("./ipc/services/managed_flutter_toolchain_service") as typeof import("./ipc/services/managed_flutter_toolchain_service");
    const flutterBin = managed.getManagedFlutterBin();
    const sdkPath = managed.getManagedFlutterSdkPath();
    if (sdkPath && typeof sdkPath === "string") {
      if (fs.existsSync(flutterBin)) {
        env.FLUTTER_ROOT = sdkPath;
        const binDir = path.join(sdkPath, "bin");
        const dartDir = path.join(sdkPath, "bin", "cache", "dart-sdk", "bin");
        const sep = path.delimiter;
        const basePath = env.PATH ?? process.env.PATH ?? "";
        const additions = [binDir, dartDir].filter((p) => {
          return !basePath.split(sep).includes(p);
        });
        if (additions.length > 0) {
          env.PATH = [...additions, basePath].filter(Boolean).join(sep);
        }
      }
    }
  } catch {}

  return {
    ...env,
    // Force non-interactive mode
    CI: "false",
    TERM: "dumb",
    // Apply any caller overrides
    ...overrides,
  };
}
