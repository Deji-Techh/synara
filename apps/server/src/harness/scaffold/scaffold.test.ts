// FILE: scaffold.test.ts
// Purpose: D gate — every framework scaffolds a valid, contract-meeting
// skeleton: framework marker, design/motion specs, per-framework app shell
// (router/tabs, kit, stores, tests, docs), no cross-framework leaks. The
// registry path (getFrameworkConfig().scaffold, as used by createApp) is
// covered too so scaffolds cannot rot unwired.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldProject } from "./index.ts";
import { getFrameworkConfig } from "../framework/registry.ts";

async function scaffold(framework: "blank" | "react-native" | "flutter" | "website") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `caide-scaf-`));
  const files = await scaffoldProject(framework, dir, "TestApp");
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), "utf8");
  return { dir, files, read, exists: (rel: string) => fs.existsSync(path.join(dir, rel)) };
}

describe("framework scaffolds (d)", () => {
  it("flutter ships router, bottom tabs, theme, providers, kit, specs, lints", async () => {
    const s = await scaffold("flutter");
    for (const f of [
      "pubspec.yaml",
      "lib/main.dart",
      "lib/router.dart",
      "lib/screens/home_screen.dart",
      "lib/screens/settings_screen.dart",
      "lib/screens/login_screen.dart",
      "lib/theme/tokens.dart",
      "lib/theme/app_theme.dart",
      "lib/widgets/app_button.dart",
      "lib/widgets/app_text_field.dart",
      "lib/widgets/app_card.dart",
      "lib/widgets/settings_row.dart",
      "lib/widgets/empty_state.dart",
      "lib/widgets/loading.dart",
      "lib/widgets/offline_banner.dart",
      "lib/widgets/login_form.dart",
      "lib/providers/theme_mode.dart",
      "lib/providers/auth_session.dart",
      "lib/services/api_client.dart",
      "lib/services/app_config.dart",
      "test/app_button_test.dart",
      "analysis_options.yaml",
      "AI_RULES.md",
      "README.md",
      ".env.example",
      ".caide/framework.json",
      ".caide/design-spec.json",
      ".caide/motion-spec.json",
      ".caide/spec.md",
    ]) {
      expect(s.exists(f), f).toBe(true);
    }
    expect(s.read("lib/router.dart")).toContain("bottomNavigationBar");
    expect(s.read("lib/router.dart")).toContain("NavigationDestination");
    expect(s.read("pubspec.yaml")).toContain("go_router");
    expect(s.read("pubspec.yaml")).toContain("flutter_riverpod");
    expect(s.read("pubspec.yaml")).toContain("connectivity_plus");
    expect(s.read("pubspec.yaml")).toContain("dio");
    expect(s.read("lib/main.dart")).not.toContain("TODO");
    expect(s.read("lib/main.dart")).toContain("OfflineBanner");
    expect(s.read("lib/main.dart")).toContain("ErrorWidget.builder");
    expect(s.read("lib/providers/auth_session.dart")).toContain("signIn");
    expect(s.read("lib/services/api_client.dart")).toContain("createApiClient");
    expect(s.read("AI_RULES.md")).toContain("flutter test");
    expect(s.read("README.md")).toContain("flutter run -d web-server");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("flutter");
  });

  it("react-native ships expo-router tabs, kit, stores, tests, docs", async () => {
    const s = await scaffold("react-native");
    for (const f of [
      "package.json",
      "app.json",
      "eas.json",
      "babel.config.js",
      "tsconfig.json",
      "jest.config.js",
      "app/_layout.tsx",
      "app/(tabs)/_layout.tsx",
      "app/(tabs)/index.tsx",
      "app/(tabs)/settings.tsx",
      "app/login.tsx",
      "app/+not-found.tsx",
      "src/screens/HomeScreen.tsx",
      "src/screens/SettingsScreen.tsx",
      "src/components/AppButton.tsx",
      "src/components/AppTextInput.tsx",
      "src/components/Card.tsx",
      "src/components/ListRow.tsx",
      "src/components/Badge.tsx",
      "src/components/EmptyState.tsx",
      "src/components/ErrorBoundary.tsx",
      "src/components/LoginForm.tsx",
      "src/store/theme.ts",
      "src/store/auth.ts",
      "src/store/__tests__/theme.test.ts",
      "src/lib/api.ts",
      "src/design/tokens.ts",
      "AI_RULES.md",
      "README.md",
      ".env.example",
      ".caide/framework.json",
      ".caide/design-spec.json",
      ".caide/motion-spec.json",
      ".caide/spec.md",
    ]) {
      expect(s.exists(f), f).toBe(true);
    }
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("react-native");
    expect(s.read(".caide/design-spec.json")).toContain("colorTokens");
    const pkg = JSON.parse(s.read("package.json"));
    expect(pkg.main).toBe("expo-router/entry");
    expect(pkg.dependencies["expo-router"]).toBeDefined();
    expect(pkg.dependencies["@expo/vector-icons"]).toBeDefined();
    expect(s.read("app/(tabs)/_layout.tsx")).toContain("Tabs.Screen");
    expect(s.read("src/components/LoginForm.tsx")).toContain("z.object");
    expect(s.read("AI_RULES.md")).toContain("expo-router");
    expect(s.read("README.md")).toContain("eas build");
    expect(s.read("eas.json")).toContain("developmentClient");
  });

  it("website ships vite skeleton with specs", async () => {
    const s = await scaffold("website");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("website");
    expect(s.exists(".caide/design-spec.json")).toBe(true);
    expect(s.exists("package.json")).toBe(true);
    for (const f of [
      "AI_RULES.md",
      "README.md",
      ".env.example",
      "tsconfig.json",
      "vitest.config.ts",
      "playwright.config.ts",
      "src/components/ErrorBoundary.tsx",
      "src/components/Layout.tsx",
      "src/components/ThemeToggle.tsx",
      "src/components/LoginForm.tsx",
      "src/components/ui/Button.tsx",
      "src/components/ui/Input.tsx",
      "src/components/ui/Card.tsx",
      "src/components/ui/Dialog.tsx",
      "src/components/ui/Badge.tsx",
      "src/components/ui/Tabs.tsx",
      "src/components/ui/Switch.tsx",
      "src/components/ui/Avatar.tsx",
      "src/components/ui/Skeleton.tsx",
      "src/components/ui/EmptyState.tsx",
      "src/components/ui/__tests__/button.test.tsx",
      "src/pages/Home.tsx",
      "src/pages/Login.tsx",
      "src/pages/NotFound.tsx",
      "src/store/theme.ts",
      "src/store/auth.ts",
      "src/lib/api.ts",
      "e2e/smoke.spec.ts",
      "public/manifest.webmanifest",
    ]) {
      expect(s.exists(f), f).toBe(true);
    }
    expect(s.read("src/App.tsx")).toContain("ErrorBoundary");
    expect(s.read("src/App.tsx")).toContain("HashRouter");
    expect(s.read("src/App.tsx")).toContain("QueryClientProvider");
    expect(s.read("AI_RULES.md")).toContain("bun run dev");
    expect(s.read("AI_RULES.md")).toContain("HashRouter");
    const pkg = JSON.parse(s.read("package.json"));
    expect(pkg.dependencies["react-router"]).toBeDefined();
    expect(pkg.dependencies["@tanstack/react-query"]).toBeDefined();
    expect(pkg.devDependencies["vitest"]).toBeDefined();
    expect(pkg.devDependencies["@playwright/test"]).toBeDefined();
  });

  it("blank ships an empty workspace with an explicit marker", async () => {
    const s = await scaffold("blank");
    expect(JSON.parse(s.read(".caide/framework.json")).framework).toBe("blank");
    expect(s.read(".caide/spec.md")).toMatch(/pending|blank/i);
  });

  it("registry scaffold entry points match the dispatcher (createApp path)", async () => {
    for (const framework of ["react-native", "flutter", "website", "blank"] as const) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `caide-scaf-reg-`));
      const config = getFrameworkConfig(framework);
      const files = await config.scaffold(dir, "RegApp");
      expect(files.length).toBeGreaterThan(0);
      expect(JSON.parse(fs.readFileSync(path.join(dir, ".caide", "framework.json"), "utf8")).framework).toBe(
        framework,
      );
    }
  });

  it("isolates frameworks: no stack leaks across RN/flutter/website", async () => {
    const rn = await scaffold("react-native");
    expect(rn.read("src/store/theme.ts")).not.toContain("localStorage");
    expect(rn.read("package.json")).not.toContain("vite");

    const flutter = await scaffold("flutter");
    expect(flutter.read("pubspec.yaml")).not.toContain("react");
    expect(flutter.read("lib/main.dart")).not.toContain("App.tsx");

    const web = await scaffold("website");
    expect(web.read("package.json")).not.toContain("expo");
    expect(web.read("src/App.tsx")).not.toContain("SafeArea");
  });
});
