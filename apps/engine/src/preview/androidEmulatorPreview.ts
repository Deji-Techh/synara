import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface AndroidEmulatorDevice {
  id: string;
  name: string;
  isEmulator: boolean;
}

export async function listEmulators(): Promise<AndroidEmulatorDevice[]> {
  const { stdout } = await execAsync("emulator -list-avds");
  const avds = stdout.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  return avds.map(avd => ({
    id: avd,
    name: avd,
    isEmulator: true
  }));
}

export async function startEmulator(avdName: string): Promise<void> {
  const child = spawn("emulator", ["-avd", avdName], { detached: true, stdio: "ignore" });
  child.unref();
  // We can't easily wait for it to be fully booted just from spawn, but we return once spawned.
}

export async function deployAppToEmulator(appDir: string, deviceId: string): Promise<void> {
  // Using flutter run -d <deviceId>
  const child = spawn("flutter", ["run", "-d", deviceId], { cwd: appDir, detached: true, stdio: "ignore" });
  child.unref();
}

export async function takeScreenshot(deviceId: string, outputPath: string): Promise<void> {
  // Wait, adb -s <deviceId> exec-out screencap -p > outputPath
  await execAsync(`adb -s ${deviceId} exec-out screencap -p > "${outputPath}"`);
}
