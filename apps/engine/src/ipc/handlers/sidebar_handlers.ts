import { createTypedHandler } from "./base";
import { sidebarContracts } from "../types/sidebar";
import { type ActiveSubagent } from "../types/sidebar";
import { getAllSubagentTasks } from "@/pro/main/ipc/handlers/local_agent/tools/team_manager";

export function registerSidebarHandlers() {
  createTypedHandler(sidebarContracts.getActiveSubagents, async (_event, { appId }) => {
    const list: ActiveSubagent[] = [];
    const seenIds = new Set<string>();

    const subagentMap = (globalThis as any).__caideActiveSubagents;
    if (subagentMap) {
      for (const subagent of subagentMap.values()) {
        seenIds.add(subagent.id);
        // Subagents with a known app scope are filtered to the requested app;
        // engine-wide subagents (no scope) are always included.
        if (
          typeof subagent.appId === "number" &&
          typeof appId === "number" &&
          subagent.appId !== appId
        ) {
          continue;
        }
        list.push({
          id: subagent.id,
          name: subagent.name,
          description: subagent.description,
          startedAt: subagent.startedAt,
          status: subagent.status ?? "running",
          ...(typeof subagent.appId === "number" ? { appId: subagent.appId } : {}),
          ...(typeof subagent.chatId === "number" ? { chatId: subagent.chatId } : {}),
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
          status: "running",
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
