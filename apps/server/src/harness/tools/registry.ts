import type { ToolDef } from "./defineTool.ts";
import { ALL_CORE_TOOLS } from "./coreTools.ts";
import { ALL_PREVIEW_TOOLS } from "./previewTools.ts";
import { ALL_DB_PANEL_TOOLS } from "../../dyad/db/dbPanel.ts";

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  constructor(initialTools: ToolDef[] = []) {
    for (const tool of initialTools) {
      this.register(tool);
    }
  }

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(filter?: { role?: string; stage?: string }): ToolDef[] {
    const all = Array.from(this.tools.values());
    if (!filter) return all;

    return all.filter((tool) => {
      if (filter.role && tool.allowedRoles && tool.allowedRoles.length > 0) {
        if (!tool.allowedRoles.includes(filter.role)) return false;
      }
      if (filter.stage && tool.allowedStages && tool.allowedStages.length > 0) {
        if (!tool.allowedStages.includes(filter.stage)) return false;
      }
      return true;
    });
  }

  getMap(): Map<string, ToolDef> {
    return new Map(this.tools);
  }
}

export function createDefaultRegistry(): ToolRegistry {
  // NOTE (M3 unification): dyad/* tool defs ride the same registry until the
  // transplant merges harness/tools and dyad/* into one tool layer.
  return new ToolRegistry([...ALL_CORE_TOOLS, ...ALL_PREVIEW_TOOLS, ...ALL_DB_PANEL_TOOLS]);
}
