// FILE: ToolApprovalsSection.tsx
// Purpose: Agent tool approvals section for Settings → Chat behavior →
// Safety confirmations. Per-tool ask/always/never for the donor ask-default
// set; everything else runs free. Own local store (M3g bridges it server-side).

import { useState } from "react";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import {
  ASK_DEFAULT_TOOLS,
  loadApprovalOverrides,
  loadSafeSql,
  saveApprovalOverrides,
  saveSafeSql,
  type ApprovalConsent,
} from "./toolApprovalsStore";

export function ToolApprovalsSection() {
  const [overrides, setOverrides] = useState(() => loadApprovalOverrides());
  const [safeSql, setSafeSql] = useState(() => loadSafeSql());

  const set = (tool: string, consent: ApprovalConsent) => {
    const next = { ...overrides };
    if (consent === "ask") delete next[tool];
    else next[tool] = consent;
    setOverrides(next);
    saveApprovalOverrides(next);
  };

  return (
    <SettingsSection title="Agent tool approvals">
      <SettingsRow
        title="Safe SQL auto-approve"
        description="Non-schema, non-deleting queries run without asking. Schema changes and deletes always ask."
        control={
          <Switch
            checked={safeSql}
            onCheckedChange={(value) => {
              setSafeSql(value);
              saveSafeSql(value);
            }}
            aria-label="Auto-approve safe SQL"
          />
        }
      />
      {ASK_DEFAULT_TOOLS.map((tool) => {
        const current = overrides[tool.name] ?? "ask";
        return (
          <SettingsRow
            key={tool.name}
            title={tool.label}
            description={tool.hint}
            control={
              <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
                {(["ask", "always", "never"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set(tool.name, c)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      current === c
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            }
          />
        );
      })}
      <SettingsRow
        title="Everything else"
        description="Reads, edits, search, preview, git reads, and MCP discovery run free without prompts unless blocked above."
        control={null}
      />
    </SettingsSection>
  );
}
