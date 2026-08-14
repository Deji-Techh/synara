// FILE: src/agent/tools/blueprintTools.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeAppBlueprintTool } from "./blueprintTools.ts";
import type { ToolContext } from "../tool.ts";

describe("blueprintTools", () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-test-"));
    context = {
      workspaceDir: tempDir,
      appDir: tempDir,
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("writeAppBlueprintTool", () => {
    it("should generate a blueprint with minimal parameters", () => {
      const args = {
        appName: "TestApp",
        description: "A simple test app",
        screens: ["HomeScreen"],
      };

      const parsedArgs = writeAppBlueprintTool.parameters.parse(args);
      const result = writeAppBlueprintTool.execute(parsedArgs, context);
      
      const filePath = path.join(tempDir, "BLUEPRINT.md");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");
      
      expect(content).toContain("TestApp");
      expect(content).toContain("A simple test app");
      expect(content).toContain("HomeScreen");
      expect(content).toContain("riverpod"); // default
      expect(content).toContain("tabs"); // default
      expect(result).toBe(content);
    });

    it("should generate a blueprint with full parameters", () => {
      const args = {
        appName: "FullApp",
        description: "A fully configured app",
        screens: ["Home", "Settings"],
        stateManagement: "bloc" as const,
        features: ["offline sync", "push notifications"],
        navigation: "drawer" as const,
      };

      const result = writeAppBlueprintTool.execute(args, context);
      
      const filePath = path.join(tempDir, "BLUEPRINT.md");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");
      
      expect(content).toContain("FullApp");
      expect(content).toContain("A fully configured app");
      expect(content).toContain("Home");
      expect(content).toContain("Settings");
      expect(content).toContain("bloc");
      expect(content).toContain("offline sync");
      expect(content).toContain("drawer");
      expect(result).toBe(content);
    });
  });
});
