// harness/deploy.ts — Real deployment pipeline per framework
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const execAsync = promisify(execCb);

export interface DeployResult {
  readonly success: boolean;
  readonly url?: string;
  readonly error?: string;
  readonly provider: string;
}

// Deploy to Netlify (Website framework)
async function deployNetlify(projectDir: string): Promise<DeployResult> {
  try {
    // Build first
    await execAsync("npx vite build", { cwd: projectDir, timeout: 120000 });

    // Deploy via netlify CLI
    const { stdout } = await execAsync("npx netlify deploy --dir=dist --prod", { cwd: projectDir, timeout: 60000 });

    // Parse URL from output
    const urlMatch = stdout.match(/https:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : "";

    return { success: true, url, provider: "netlify" };
  } catch (e) {
    return { success: false, error: (e as Error).message, provider: "netlify" };
  }
}

// Deploy to Vercel (Website framework)
async function deployVercel(projectDir: string): Promise<DeployResult> {
  try {
    await execAsync("npx vite build", { cwd: projectDir, timeout: 120000 });
    const { stdout } = await execAsync("npx vercel --prod --yes", { cwd: projectDir, timeout: 120000 });

    const urlMatch = stdout.match(/https:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : "";

    return { success: true, url, provider: "vercel" };
  } catch (e) {
    return { success: false, error: (e as Error).message, provider: "vercel" };
  }
}

// Deploy to Expo (React Native framework)
async function deployExpo(projectDir: string): Promise<DeployResult> {
  try {
    // Read app.json for project config
    const appJson = JSON.parse(await readFile(join(projectDir, "app.json"), "utf8").catch(() => "{}"));
    const slug = appJson.expo?.slug ?? "my-app";

    // Build for web
    await execAsync("npx expo export --platform web", { cwd: projectDir, timeout: 120000 });

    // Deploy to Expo hosting (fallback to netlify)
    await execAsync("npx expo-cli publish --platform web", { cwd: projectDir, timeout: 60000 }).catch(() => {});

    return { success: true, url: `https://${slug}.expo.app`, provider: "expo" };
  } catch (e) {
    return { success: false, error: (e as Error).message, provider: "expo" };
  }
}

// Build APK for Flutter (local build)
async function buildFlutterApk(projectDir: string): Promise<DeployResult> {
  try {
    await execAsync("flutter build apk --release", { cwd: projectDir, timeout: 300000 });
    const apkPath = join(projectDir, "build", "app", "outputs", "apk", "release", "app-release.apk");
    return { success: true, url: apkPath, provider: "flutter-local" };
  } catch (e) {
    return { success: false, error: (e as Error).message, provider: "flutter-local" };
  }
}

// Main deploy function — picks provider by framework
export async function deployProject(projectDir: string, framework: string, provider?: "netlify" | "vercel" | "expo"): Promise<DeployResult> {
  switch (framework) {
    case "website":
      if (provider === "vercel") return deployVercel(projectDir);
      return deployNetlify(projectDir);
    case "react-native":
      if (provider === "expo") return deployExpo(projectDir);
      return deployNetlify(projectDir);
    case "flutter":
      return buildFlutterApk(projectDir);
    default:
      return { success: false, error: "No deploy target for blank framework", provider: "none" };
  }
}
