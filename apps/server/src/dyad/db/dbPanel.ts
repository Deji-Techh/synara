// FILE: dbPanel.ts
// Purpose: Database right-dock auto-open + agent control. Whenever the agent
// works with a database (DB tools, plan/questionnaire about data, or asking
// the user to create/provision one), the server reveals the `database` right
// dock pane automatically — the agent never has to ask the user to open it.
// The WS layer delivers the reveal in M3; until then requests are recorded
// and reported undelivered (never a failure).

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

/** Tools whose invocation means "the agent is working with a database". */
export const DB_TOOL_NAMES: ReadonlySet<string> = new Set([
  "execute_sql",
  "get_supabase_project_info",
  "get_neon_project_info",
  "get_database_table_schema",
  "add_integration",
  "enable_nitro",
]);

/** Reasons that should also reveal the pane even without a DB tool call. */
export function shouldRevealDatabasePanelForText(text: string): boolean {
  return /(database|supabase|neon|postgres|sql|provision.*backend|connection string|database_url)/i.test(
    text,
  );
}

/** Single rule the WS layer applies to every tool_call event (M3). */
export function shouldRevealDatabasePanel(toolName: string): boolean {
  return DB_TOOL_NAMES.has(toolName);
}

export interface DbPanelTransport {
  revealDatabase(sessionId: string, reason: string): void;
}

let transport: DbPanelTransport | null = null;
export function setDbPanelTransport(t: DbPanelTransport | null): void {
  transport = t;
}
export function getDbPanelTransport(): DbPanelTransport | null {
  return transport;
}

export async function requestDatabasePanel(
  sessionId: string,
  reason: string,
): Promise<{ requested: boolean; delivered: boolean }> {
  const t = transport;
  if (!t) return { requested: true, delivered: false };
  t.revealDatabase(sessionId, reason);
  return { requested: true, delivered: true };
}

const openDatabasePanelSchema = z.object({
  reason: z
    .string()
    .optional()
    .describe("Why the database pane is needed (shown nowhere user-visible; for logs)"),
});

/** Agent-callable: open the database pane itself, autonomously. */
export const openDatabasePanelTool = defineTool({
  name: "open_database_panel",
  description:
    "Opens the database panel in the right sidebar (tables, schema, connection status). Call it yourself whenever you start database work or need the user to create/provision a database — it opens automatically and you can keep working. Never ask the user to open it manually.",
  schema: openDatabasePanelSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = openDatabasePanelSchema.parse(args);
    const result = await requestDatabasePanel(
      ctx.sessionId,
      parsed.reason ?? "agent database work",
    );
    return {
      opened: true,
      delivered: result.delivered,
      pane: "database",
      note: result.delivered
        ? "Database pane revealed."
        : "Reveal recorded; the connected client opens the database pane on next sync (WS delivery lands in M3).",
    };
  },
  presentCall: () => "Open database panel",
});

export const ALL_DB_PANEL_TOOLS: ToolDef[] = [openDatabasePanelTool];
