import { z } from "zod";
import { BrowserWindow } from "electron";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildTool, type AgentContext } from "./types";
import { getCaideAppPath } from "@/paths/paths";
import { isFlutterApp } from "@/ipc/utils/flutter_utils";

const execFileAsync = promisify(execFile);

const captureScreenshotSchema = z.object({});

/**
 * Best-effort capture of a connected device screen for Flutter apps: Android
 * emulator/physical device via `adb exec-out screencap -p`, iOS simulator via
 * `xcrun simctl io booted screenshot` (macOS only). Falls back to the CAIDE
 * window (which includes the web-server preview) when no device is reachable.
 */
async function captureFlutterDeviceScreen(
  evidenceDir: string,
): Promise<string | null> {
  const deadline = path.join(evidenceDir, `device_${Date.now()}.png`);

  // Android: prefer a single connected device (emulator or USB).
  try {
    const { stdout } = await execFileAsync("adb", ["devices", "-l"], {
      timeout: 8_000,
    });
    const serials = stdout
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(/\s+/)[0])
      .filter((serial) => serial.length > 0 && !serial.startsWith("*"));
    if (serials.length > 0) {
      const serial = serials[0];
      const png = execFileSync(
        "adb",
        ["-s", serial, "exec-out", "screencap", "-p"],
        {
          stdio: ["ignore", "pipe", "ignore"],
          encoding: "buffer",
          timeout: 10_000,
        },
      );
      if (png && png.length > 0) {
        await fs.writeFile(deadline, png);
        return deadline;
      }
    }
  } catch {
    // no adb / no device — try iOS below
  }

  // iOS simulator: only on macOS with a booted simulator.
  if (process.platform === "darwin") {
    try {
      await execFileAsync(
        "xcrun",
        ["simctl", "io", "booted", "screenshot", deadline],
        {
          timeout: 10_000,
        },
      );
      await fs.access(deadline);
      return deadline;
    } catch {
      // fall through to window capture
    }
  }

  return null;
}

export const captureScreenshotTool = buildTool({
  name: "capture_screenshot",
  description: `Capture a screenshot of the running app. For Flutter apps this captures the
connected emulator/simulator screen (adb screencap / xcrun simctl); for other
apps it captures the current CAIDE window (which includes the app preview).
Saves the screenshot to the project's .caide/evidence/ folder as a PNG.
Returns the file path.
Use inside a goal run to generate 'screenshot' kind evidence.`,
  inputSchema: captureScreenshotSchema,
  defaultConsent: "always",
  isReadOnly: true,

  execute: async (_args, ctx: AgentContext) => {
    const appPath = getCaideAppPath(ctx.appPath);
    const evidenceDir = path.join(appPath, ".caide", "evidence");
    await fs.mkdir(evidenceDir, { recursive: true });

    if (isFlutterApp(appPath)) {
      const deviceShot = await captureFlutterDeviceScreen(evidenceDir);
      if (deviceShot) {
        return `Screenshot captured from the connected device and saved to: ${deviceShot}`;
      }
    }

    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      return "ERROR: No active window found to capture.";
    }

    const mainWindow = windows[0];
    const nativeImage = await mainWindow.webContents.capturePage();
    if (nativeImage.isEmpty()) {
      return "ERROR: Captured image is empty.";
    }

    const buffer = nativeImage.toPNG();
    const filename = `screenshot_${Date.now()}.png`;
    const filepath = path.join(evidenceDir, filename);

    await fs.writeFile(filepath, buffer);

    return `Screenshot captured and saved to: ${filepath}`;
  },
});
