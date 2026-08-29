// harness/devServer.ts — M21 Real dev server (npm install/flutter pub get/vite dev)
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(execCb);

export interface DevServerResult {
  readonly port: number;
  readonly url: string;
  readonly pid: number | null;
  readonly error?: string;
}

// Start dev server for a project based on framework
export async function startDevServer(projectDir: string, framework: string): Promise<DevServerResult> {
  try {
    switch (framework) {
      case "react-native": {
        // npm install + npx expo start
        await execAsync("npm install", { cwd: projectDir, timeout: 60000 });
        const { stdout } = await execAsync("npx expo start --port 8081 --non-interactive", { cwd: projectDir, timeout: 10000 });
        const port = 8081;
        return { port, url: `http://localhost:${port}`, pid: null };
      }
      case "flutter": {
        // flutter pub get + flutter run
        await execAsync("flutter pub get", { cwd: projectDir, timeout: 60000 });
        const { stdout } = await execAsync("flutter run --machine --port 8082", { cwd: projectDir, timeout: 10000 });
        const port = 8082;
        return { port, url: `http://localhost:${port}`, pid: null };
      }
      case "website": {
        // npm install + vite dev
        await execAsync("npm install", { cwd: projectDir, timeout: 60000 });
        const { stdout } = await execAsync("npx vite --port 5173", { cwd: projectDir, timeout: 10000 });
        const port = 5173;
        return { port, url: `http://localhost:${port}`, pid: null };
      }
      default:
        return { port: 0, url: "", pid: null, error: "No dev server for blank framework" };
    }
  } catch (e) {
    return { port: 0, url: "", pid: null, error: (e as Error).message };
  }
}

// Stop dev server
export async function stopDevServer(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

// Build project for deployment
export async function buildProject(projectDir: string, framework: string): Promise<{ outputDir: string; error?: string }> {
  try {
    switch (framework) {
      case "react-native": {
        await execAsync("npx expo export", { cwd: projectDir, timeout: 120000 });
        return { outputDir: join(projectDir, "dist") };
      }
      case "flutter": {
        await execAsync("flutter build apk --release", { cwd: projectDir, timeout: 300000 });
        return { outputDir: join(projectDir, "build", "app", "outputs", "apk", "release") };
      }
      case "website": {
        await execAsync("npx vite build", { cwd: projectDir, timeout: 120000 });
        return { outputDir: join(projectDir, "dist") };
      }
      default:
        return { outputDir: "", error: "No build for blank framework" };
    }
  } catch (e) {
    return { outputDir: "", error: (e as Error).message };
  }
}
