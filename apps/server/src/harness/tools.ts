// harness/tools.ts — M6 Caide tools (inspired by dyad×caide set, now pure Caide)
// Tight schema, explicit failure modes in description, readOnly flag for parallel vs sequential

export type ToolDef = {
  readonly name: string;
  readonly description: string; // for model, includes failure modes
  readonly readOnly: boolean;
  readonly required: readonly string[];
  readonly optional?: readonly string[];
};

export const CAIDE_TOOLS: readonly ToolDef[] = [
  { name: "read", description: "Read a file. Returns error if path outside project root or not found.", readOnly: true, required: ["path"] },
  { name: "write", description: "Write a file. Returns error if path outside project root or parent missing.", readOnly: false, required: ["path", "content"] },
  { name: "grep", description: "Search code. Returns error if pattern invalid.", readOnly: true, required: ["pattern"] },
  { name: "list", description: "List files. Returns error if path outside project root.", readOnly: true, required: ["path"] },
  { name: "bash", description: "Run a shell command. Returns error if timeout or non-zero exit.", readOnly: false, required: ["command"] },
  { name: "webfetch", description: "Fetch a URL. Returns error if network fails.", readOnly: true, required: ["url"] },
  { name: "screenshot", description: "Capture preview screenshot. Returns error if preview not running. Killable via SIGTERM.", readOnly: true, required: ["threadId"] },
  { name: "planning_questionnaire", description: "Ask user questionnaire. Returns error if called outside plan mode.", readOnly: false, required: ["questions"] },
] as const;

export function isReadOnlyTool(name: string): boolean {
  return CAIDE_TOOLS.find((t) => t.name === name)?.readOnly ?? false;
}

export function canRunToolInMode(tool: string, mode: "plan" | "default"): boolean {
  if (mode === "plan") return ["read", "grep", "list", "webfetch", "planning_questionnaire"].includes(tool);
  return true;
}
