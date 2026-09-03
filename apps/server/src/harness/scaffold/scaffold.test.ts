// FILE: scaffold.test.ts
// Purpose: D gate — every framework scaffolds a valid, contract-meeting
// skeleton: framework marker, design/motion specs, mobile tabs for RN +
// Flutter, no cross-framework leaks.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldProject } from "./index.ts";

async function scaffold(framework: "blank" | "react-native" | "flutter" | "website") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `caide-scaf-`));
  const files = await scaffoldProject(framework, dir, "TestApp");
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), "utf8");
  return { dir, files, read, exists: (rel: string) => fs.existsSync(path.join(dir, rel)) };
}

describe("framework scaffolds (d)", () => {
  it("flutter ships router, bottom tabs, theme, specs, lints", async () => {
    const s = await scaffold("flutter");
    for (const f of ["pubspec.yaml", "lib/main.dart", "lib/router.dart", "lib/screens/home_screen.dart", "lib/screens/settings_screen.dart", "lib/theme/tokens.dart", "lib/theme/app_theme.dart", "analysis_options.yaml", ".caide/framework.json", ".caide/design-spec.json", ".caide/motion-spec.json", ".caide/spec.md"]) {
      expect(s.exists(f), f).toBe(true);
    }
    expect(s.read("lib/router.dart")).toContain("bottomNavigationBar");
    expect(s.read("lib/router.dart")).toContain("NavigationDestination");
    expect(s.read("pubspec.yaml")).toContain("go_router");
    expect(s.read("pubspec.yaml")).toContain("flutter_riverpod");
    expect(s.read("lib/main.dart")).not.toContain("TODO");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("flutter");
  });

  it("react-native ships expo skeleton with specs", async () => {
    const s = await scaffold("react-native");
    expect(s.exists(".caide/framework.json")).toBe(true);
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("react-native");
    expect(s.exists(".caide/design-spec.json")).toBe(true);
    expect(s.exists("package.json")).toBe(true);
  });

  it("website ships vite skeleton with specs", async () => {
    const s = await scaffold("website");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("website");
    expect(s.exists(".caide/design-spec.json")).toBe(true);
    expect(s.exists("package.json")).toBe(true);
  });

  it("blank ships an empty workspace with an explicit marker", async () => {
    const s = await scaffold("blank");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("blank");
    expect(s.read(".caide/spec.md")).toMatch(/pending|blank/i);
  });
});
