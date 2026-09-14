// FILE: CompactionSection.tsx
// Purpose: Context-compaction settings (Settings → Chat behavior): auto-compact
// threshold with provider-aware clamping, kill-switch, pre-compaction backup
// retention note, manual Compact-now, and last-compaction status.

import { useEffect, useRef, useState } from "react";
import { Switch } from "~/components/ui/switch";
import { Button } from "~/components/ui/button";
import {
  connectHarnessWs,
  makeHarnessUrl,
  readCompactionEnabled,
  readCompactionThresholdTokens,
  writeCompactionPrefs,
  DEFAULT_COMPACTION_THRESHOLD_TOKENS,
} from "~/harnessWs";
import { harnessStore, useHarnessStore } from "~/harnessStore";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import { DebouncedSettingTextInput } from "./DebouncedSettingTextInput";

const MIN_THRESHOLD = 32_000;
const MAX_THRESHOLD = 1_000_000;

function clampThreshold(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.floor(n)));
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

export function CompactionSection() {
  const [enabled, setEnabled] = useState(() => readCompactionEnabled());
  const [threshold, setThreshold] = useState(() => String(readCompactionThresholdTokens()));
  const [running, setRunning] = useState(false);
  const store = useHarnessStore();
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const commitThreshold = (raw: string) => {
    const clamped = clampThreshold(raw);
    const next = clamped ?? DEFAULT_COMPACTION_THRESHOLD_TOKENS;
    setThreshold(String(next));
    writeCompactionPrefs(enabled, next);
  };

  const toggleEnabled = (value: boolean) => {
    setEnabled(value);
    writeCompactionPrefs(value, Number(threshold) || DEFAULT_COMPACTION_THRESHOLD_TOKENS);
  };

  const runNow = () => {
    const sessionId = harnessStore.getState().activeSessionId;
    if (!sessionId || running) return;
    setRunning(true);
    const finish = () => {
      setRunning(false);
      try {
        handle.disconnect();
      } catch {
        // already closed
      }
    };
    const handle = connectHarnessWs({
      url: makeHarnessUrl(null),
      sessionId,
      onOpen: () => {
        handle.send({ type: "compact_now", sessionId });
      },
      onEvent: (event) => {
        if (event.type === "compaction" || event.type === "error") finish();
      },
      onClose: () => setRunning(false),
    });
    timerRef.current = window.setTimeout(finish, 90_000);
  };

  const last = store.lastCompaction;
  const status = last
    ? `Last compacted ${new Date(last.at).toLocaleString()} (${last.reason}, summary ~${formatTokens(last.summaryLength)} chars).`
    : "No compaction has run yet this session.";

  return (
    <SettingsSection title="Context compaction">
      <SettingsRow
        title="Auto-compact long chats"
        description="Summarize older turns into a compacted boundary instead of failing on context limits. Applies to the next turn."
        control={<Switch checked={enabled} onCheckedChange={toggleEnabled} />}
      />
      <SettingsRow
        title="Compaction threshold"
        description="Start compacting past this many tokens. Clamped automatically per model (190k Google, 220k OpenAI, 250k otherwise, always 25k below the model's window)."
        control={
          <DebouncedSettingTextInput
            value={threshold}
            onCommit={commitThreshold}
            className="w-28 text-right font-mono text-xs"
            inputMode="numeric"
            aria-label="Compaction threshold in tokens"
          />
        }
        status={`Effective ceiling: ${formatTokens(Number(threshold) || DEFAULT_COMPACTION_THRESHOLD_TOKENS)} tokens (default ${formatTokens(DEFAULT_COMPACTION_THRESHOLD_TOKENS)}). Pre-compaction backups keep the last 5 per chat under .dyad/chats.`}
      />
      <SettingsRow
        title="Compact now"
        description="Summarize the current chat's older turns immediately. Refused while a turn is running."
        status={status}
        control={
          <Button size="xs" onClick={runNow} disabled={running}>
            {running ? "Compacting…" : "Compact now"}
          </Button>
        }
      />
    </SettingsSection>
  );
}
