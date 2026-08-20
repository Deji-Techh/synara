import { createTypedHandler } from "./base";
import { sidebarContracts } from "../types/sidebar";
import { type ActiveSubagent } from "../types/sidebar";
import { getAllSubagentTasks } from "@/pro/main/ipc/handlers/local_agent/tools/team_manager";

export function registerSidebarHandlers() {
  createTypedHandler(sidebarContracts.getActiveSubagents, async (_event, { appId: _appId }) => {
    const list: ActiveSubagent[] = [];
    const seenIds = new Set<string>();

    const subagentMap = (globalThis as any).__caideActiveSubagents;
    if (subagentMap) {
      for (const subagent of subagentMap.values()) {
        seenIds.add(subagent.id);
        list.push({
          id: subagent.id,
          name: subagent.name,
          description: subagent.description,
          startedAt: subagent.startedAt,
        });
      }
    }

    const tasks = getAllSubagentTasks();
    for (const t of tasks) {
      if (t.status === "running" && !seenIds.has(t.id)) {
        list.push({
          id: t.id,
          name: t.role,
          description: t.taskDescription,
          startedAt: Date.now(),
        });
      }
    }

    return list;
  });

  createTypedHandler(sidebarContracts.getArtifacts, async (_event, { appId: _appId }) => {
    // Return empty for now as CAIDE doesn't strictly have an artifacts dir yet
    return [];
  });

  createTypedHandler(sidebarContracts.getBackgroundTasks, async (_event, { appId: _appId }) => {
    return (globalThis as any).__caideBackgroundTasks || [];
  });
}
