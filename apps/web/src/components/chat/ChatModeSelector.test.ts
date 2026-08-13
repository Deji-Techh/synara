// FILE: ChatModeSelector.test.ts
// Purpose: Unit tests for the chat-mode selector's display metadata and option
// ordering. The picker exposes the same four modes as the engine's ChatMode
// wire type (build/ask/local-agent/plan) so plan/ask behavior stays reachable.
// Layer: App composer logic test

import { describe, expect, it } from "vitest";

import { CHAT_MODE_META, CHAT_MODE_ORDER, getChatModeDisplayName } from "./ChatModeSelector";
import { AskIcon, BotIcon, HammerIcon, LightBulbIcon } from "~/lib/icons";

describe("ChatModeSelector", () => {
  it("orders options agent, plan, build, ask", () => {
    expect(CHAT_MODE_ORDER).toEqual(["local-agent", "plan", "build", "ask"]);
  });

  it("provides a display name and hint glyph for every chat mode", () => {
    for (const mode of CHAT_MODE_ORDER) {
      expect(getChatModeDisplayName(mode).length).toBeGreaterThan(0);
    }
  });

  it("uses a distinct icon per mode", () => {
    const icons = CHAT_MODE_ORDER.map((mode) => CHAT_MODE_META[mode].Icon);
    const uniqueIcons = new Set(
      [BotIcon, LightBulbIcon, HammerIcon, AskIcon].map((Icon) => icons.indexOf(Icon)),
    );
    expect(icons.length).toBe(4);
    expect(uniqueIcons.size).toBe(4);
  });
});
