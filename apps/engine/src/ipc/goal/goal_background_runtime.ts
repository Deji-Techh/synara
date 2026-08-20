import path from "node:path";
import { app, BrowserWindow, Menu, Tray } from "electron";
import log from "electron-log";
import { hasContinuingGoals } from "./goal_store";

const logger = log.scope("goal_background_runtime");
let tray: Tray | null = null;
let showMainWindow: (() => void) | null = null;
let quitting = false;
app.once("before-quit", () => {
  quitting = true;
});

function ensureTray(): void {
  if (tray) return;
  try {
    tray = new Tray(path.join(app.getAppPath(), "assets/icon/logo.png"));
    tray.setToolTip("CAIDE — goals running in background");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Open CAIDE",
          click: () => showMainWindow?.(),
        },
        { type: "separator" },
        {
          label: "Quit CAIDE",
          click: () => app.quit(),
        },
      ]),
    );
    tray.on("double-click", () => showMainWindow?.());
    app.once("will-quit", () => {
      tray?.destroy();
      tray = null;
    });
  } catch (error) {
    logger.warn("Could not create background-goal tray", error);
  }
}

export function installGoalBackgroundWindowBehavior(
  window: BrowserWindow,
  restoreWindow: () => void,
): void {
  showMainWindow = restoreWindow;
  window.on("close", (event) => {
    if (quitting || !hasContinuingGoals()) return;
    event.preventDefault();
    window.hide();
    ensureTray();
    logger.info("Main window hidden while unfinished goals continue in the background");
  });

  let recoveryScheduled = false;
  window.webContents.on("render-process-gone", (_event, details) => {
    if (quitting || recoveryScheduled || details.reason === "clean-exit" || !hasContinuingGoals()) {
      return;
    }
    recoveryScheduled = true;
    setTimeout(() => {
      recoveryScheduled = false;
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        logger.warn("Reloading the renderer so durable goal execution can recover");
        window.reload();
      }
    }, 2_000);
  });
}
