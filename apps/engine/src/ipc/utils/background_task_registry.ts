import type { BackgroundTask } from "../types/sidebar";

class BackgroundTaskRegistry {
  private tasks = new Map<string, BackgroundTask>();

  public registerTask(
    id: string,
    name: string,
    status: BackgroundTask["status"] = "running",
  ): BackgroundTask {
    const task: BackgroundTask = { id, name, status };
    this.tasks.set(id, task);
    this.syncGlobal();
    return task;
  }

  public updateTaskStatus(id: string, status: BackgroundTask["status"]) {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      this.syncGlobal();
    }
  }

  public removeTask(id: string) {
    this.tasks.delete(id);
    this.syncGlobal();
  }

  public getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  private syncGlobal() {
    (globalThis as any).__caideBackgroundTasks = this.getAllTasks();
  }
}

export const backgroundTaskRegistry = new BackgroundTaskRegistry();
