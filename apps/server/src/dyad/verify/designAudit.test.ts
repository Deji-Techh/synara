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
  colorTokens: {
    accent: "#007AFF",
    background: "#F2F2F7",
    surface: "#FFF",
    textPrimary: "#000",
    textMuted: "#636366",
  },
  darkMode: { enabled: true },
  imagery: { strategy: "generated" },
  viewportsVerified: [
    "compact-phone",
    "large-phone",
    "phone-landscape",
    "tablet-portrait",
    "tablet-landscape",
  ],
});
const GOOD_MOTION = JSON.stringify({
  entries: [{ id: "tab", trigger: "press", technique: "default", reducedMotionFallback: "none" }],
});

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

  it("flags missing viewport meta, fixed widths, and absent responsive rules (web)", () => {
    const dir = fixture({
      ".caide/design-spec.json": GOOD_SPEC,
      ".caide/motion-spec.json": GOOD_MOTION,
      "package.json": JSON.stringify({ dependencies: { react: "*", vite: "*" } }),
      "index.html": "<html><head><title>x</title></head></html>",
      "src/App.tsx": `export const A = () => <div style={{ width: "390px" }}>hi</div>;`,
    });
    const findings = auditDesignWorkspace(dir);
    const viewports = findings.filter((f) => f.check === "viewports");
    expect(
      viewports.some((f) => f.level === "major" && /meta name="viewport"/i.test(f.message)),
    ).toBe(true);
    expect(viewports.some((f) => /Fixed phone width/.test(f.message))).toBe(true);
    expect(viewports.some((f) => /No responsive rules/.test(f.message))).toBe(true);
  });

  it("passes a responsive web workspace with viewport meta", () => {
    const dir = fixture({
      ".caide/design-spec.json": GOOD_SPEC,
      ".caide/motion-spec.json": GOOD_MOTION,
      "package.json": JSON.stringify({ dependencies: { react: "*" } }),
      "index.html": `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>`,
      "src/App.tsx": `import { useColorScheme } from 'react';\nexport const A = () => <div className="grid md:grid-cols-2">hi</div>;`,
    });
    const findings = auditDesignWorkspace(dir);
    expect(findings.filter((f) => f.check === "viewports")).toEqual([]);
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

  it("judges idiomatic Flutter code by Flutter oracles (F1)", () => {
    const dir = fixture({
      ".caide/design-spec.json": GOOD_SPEC,
      ".caide/motion-spec.json": GOOD_MOTION,
      "pubspec.yaml": "name: x\ndependencies:\n  flutter:\n    sdk: flutter\n",
      "lib/home.dart": [
        "import 'package:flutter/material.dart';",
        "import 'package:flutter/cupertino.dart';",
        "final dark = ThemeMode.dark;",
        "final noAnim = MediaQuery.disableAnimationsOf(context);",
        "Semantics(label: 'Save', child: InkWell(onTap: () {}, child: Text('x')))",
        "final initials = 'AB';",
        "CircleAvatar(backgroundColor: Colors.blue, child: Text(initials))",
      ].join("\n"),
    });
    const findings = auditDesignWorkspace(dir);
    // Material + Cupertino coexistence is idiomatic — no icon finding.
    expect(findings.filter((f) => f.check === "icons")).toEqual([]);
    // Semantics-labeled InkWell + MediaQuery motion handling pass.
    expect(findings.filter((f) => f.check === "accessibility")).toEqual([]);
    expect(findings.filter((f) => f.check === "motion")).toEqual([]);
    // Avatar initials are a minor note on Flutter, not a major.
    const imagery = findings.filter((f) => f.check === "imagery");
    expect(imagery.every((f) => f.level === "minor")).toBe(true);
  });

  it("checks the Flutter web entry viewport meta (F1)", () => {
    const dir = fixture({
      ".caide/design-spec.json": GOOD_SPEC,
      ".caide/motion-spec.json": GOOD_MOTION,
      "pubspec.yaml": "name: x\n",
      "web/index.html": "<html><head><title>x</title></head></html>",
      "lib/main.dart": "void main() {}",
    });
    const findings = auditDesignWorkspace(dir);
    expect(
      findings.some(
        (f) => f.check === "viewports" && f.file === "web/index.html" && f.level === "major",
      ),
    ).toBe(true);
  });
});
