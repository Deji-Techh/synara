// FILE: designAudit.test.ts
// Purpose: verify_design gate — flags initials-art, icon mixing, missing
// dark mode, missing/invalid specs; clean fixture passes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { auditDesignWorkspace, verifyDesignTool } from "./designAudit.ts";

function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-design-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const GOOD_SPEC = JSON.stringify({
  colorTokens: { accent: "#007AFF", background: "#F2F2F7", surface: "#FFF", textPrimary: "#000", textMuted: "#636366" },
  darkMode: { enabled: true },
  imagery: { strategy: "generated" },
  viewportsVerified: ["compact-phone", "large-phone", "phone-landscape", "tablet-portrait", "tablet-landscape"],
});
const GOOD_MOTION = JSON.stringify({ entries: [{ id: "tab", trigger: "press", technique: "default", reducedMotionFallback: "none" }] });

describe("verify_design audit", () => {
  it("passes a compliant workspace", () => {
    const dir = fixture({
      ".caide/design-spec.json": GOOD_SPEC,
      ".caide/motion-spec.json": GOOD_MOTION,
      "src/App.tsx": `import { useColorScheme } from 'react-native';\nimport * as Symbols from 'expo-symbols';\nexport const A = () => <Symbols.SFSymbol name="heart" />;`,
    });
    expect(auditDesignWorkspace(dir)).toEqual([]);
  });

  it("flags missing specs, initials art, icon mixing, no dark mode", () => {
    const dir = fixture({
      "src/Card.tsx": `import { Ionicons } from '@expo/vector-icons';\nimport { MaterialIcons } from '@expo/vector-icons';\nimport { FontAwesome } from '@expo/vector-icons';\nexport const Thumb = ({listing}) => <View style={{backgroundColor: listing.color}}><Text>{listing.initials}</Text></View>;`,
      "src/Other.tsx": `import { useColorScheme } from 'react-native';\nimport { CupertinoIcons } from 'react-native';\nimport * as Symbols from 'expo-symbols';\nexport const B = 1; // lorem ipsum`,
    });
    const findings = auditDesignWorkspace(dir);
    const byCheck = (c: string) => findings.filter((f) => f.check === c);
    expect(byCheck("design-spec").some((f) => f.level === "major")).toBe(true);
    expect(byCheck("imagery").some((f) => f.level === "major")).toBe(true);
    expect(byCheck("icons").some((f) => f.level === "major")).toBe(true);
    expect(byCheck("mock-data").length).toBeGreaterThan(0);
  });

  it("tool presents a countable summary", async () => {
    const dir = fixture({ "src/a.ts": "export const x = 1;" });
    const out = (await verifyDesignTool.execute(
      { scope: "ui" },
      { signal: AbortSignal.timeout(1000), appPath: dir, sessionId: "s", toolId: "t" },
    )) as string;
    expect(out).toMatch(/Design audit: \d+ major, \d+ minor/);
    expect(verifyDesignTool.presentCall?.({})).toBe("Audit design quality");
  });
});
