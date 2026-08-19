import { exec } from "node:child_process";
import log from "electron-log";

const logger = log.scope("process_tree");

/**
 * Kills a process and all of its child subprocesses (process group teardown).
 * On POSIX systems, passing a negative PID (-pid) to process.kill sends the signal
 * to the entire process group. On Windows, taskkill /F /T /PID is used.
 */
export function killProcessTree(
  pid: number | undefined,
  signal = "SIGTERM",
): void {
  if (!pid || pid <= 0) return;

  if (process.platform === "win32") {
    try {
      exec(`taskkill /F /T /PID ${pid}`, (error) => {
        if (error) {
          logger.debug(`taskkill error for PID ${pid}:`, error.message);
        }
      });
    } catch (e) {
      logger.warn(`Failed to execute taskkill for PID ${pid}:`, e);
    }
  } else {
    try {
      // Send signal to the negative PID (process group leader)
      process.kill(-pid, signal);
    } catch (err: any) {
      if (err.code !== "ESRCH") {
        // If killing group failed, fall back to killing single PID
        try {
          process.kill(pid, signal);
        } catch {
          // Ignore if process already exited
        }
      }
    }
  }
}
