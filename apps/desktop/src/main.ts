// Minimal Electron main process — starts Caide server + opens browser window
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { spawn } from "node:child_process";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ReturnType<typeof spawn> | null = null;

const SERVER_PORT = 58080;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, "..", "..", "..", "apps", "server", "src", "main.ts");
    serverProcess = spawn("bun", ["run", serverPath], {
      stdio: "pipe",
      env: { ...process.env, CAIDE_PORT: String(SERVER_PORT) },
    });

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("running at")) {
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      console.error("Server:", data.toString());
    });

    serverProcess.on("error", reject);
    setTimeout(resolve, 3000); // Fallback after 3s
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Caide",
    icon: join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
