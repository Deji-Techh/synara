import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  frameworkRegistry,
  getFrameworkConfig,
  assertFrameworkImmutable,
  FrameworkImmutableError,
} from "./registry.ts";
import { scaffoldProject } from "../scaffold/index.ts";

describe("Milestone M15 — Framework Registry & Scaffold Templates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-scaffold-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("scaffolds a complete React Native Expo project structure with design and motion specs", async () => {
    const targetDir = path.join(tempDir, "rn-app");
    const createdFiles = await scaffoldProject("react-native", targetDir, "SuperRN");

    expect(createdFiles).toContain("package.json");
    expect(createdFiles).toContain("App.tsx");
    expect(createdFiles).toContain("app.json");
    expect(createdFiles).toContain("src/design/tokens.ts");
    expect(createdFiles).toContain(".caide/framework.json");
    expect(createdFiles).toContain(".caide/design-spec.json");
    expect(createdFiles).toContain(".caide/motion-spec.json");

    // Check package.json contents
    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf-8"));
    expect(pkg.dependencies.expo).toBeDefined();
    expect(pkg.dependencies["@react-navigation/native"]).toBeDefined();

    // Check design tokens
    const designSpec = JSON.parse(
      fs.readFileSync(path.join(targetDir, ".caide", "design-spec.json"), "utf-8"),
    );
    expect(designSpec.colorTokens.background).toBe("#0D0D0D");
  });

  it("scaffolds a complete Flutter project structure with Riverpod and tokens", async () => {
    const targetDir = path.join(tempDir, "flutter-app");
    const createdFiles = await scaffoldProject("flutter", targetDir, "SuperFlutter");

    expect(createdFiles).toContain("pubspec.yaml");
    expect(createdFiles).toContain("lib/main.dart");
    expect(createdFiles).toContain("lib/theme/tokens.dart");
    expect(createdFiles).toContain(".caide/framework.json");

    const pubspec = fs.readFileSync(path.join(targetDir, "pubspec.yaml"), "utf-8");
    expect(pubspec).toContain("flutter_riverpod");
    expect(pubspec).toContain("go_router");
  });

  it("scaffolds a complete Website project structure with Vite, React 19, and Tailwind v4", async () => {
    const targetDir = path.join(tempDir, "web-app");
    const createdFiles = await scaffoldProject("website", targetDir, "SuperWeb");

    expect(createdFiles).toContain("package.json");
    expect(createdFiles).toContain("vite.config.ts");
    expect(createdFiles).toContain("index.html");
    expect(createdFiles).toContain("src/App.tsx");
    expect(createdFiles).toContain("src/main.tsx");
    expect(createdFiles).toContain("src/index.css");

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf-8"));
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
  });

  it("scaffolds a clean Blank project structure", async () => {
    const targetDir = path.join(tempDir, "blank-app");
    const createdFiles = await scaffoldProject("blank", targetDir, "SuperBlank");

    expect(createdFiles).toContain("README.md");
    expect(createdFiles).toContain("src/index.ts");
    expect(createdFiles).toContain(".caide/framework.json");
  });

  it("assertFrameworkImmutable enforces that project framework cannot be mutated after creation", () => {
    // Valid identical framework
    expect(() => assertFrameworkImmutable("react-native", "react-native")).not.toThrow();

    // Invalid attempted mutation
    expect(() => assertFrameworkImmutable("react-native", "flutter")).toThrowError(
      FrameworkImmutableError,
    );
    expect(() => assertFrameworkImmutable("website", "blank")).toThrowError(
      FrameworkImmutableError,
    );
  });
});
