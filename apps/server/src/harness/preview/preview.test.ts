import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  fingerprintFiles,
  diffFingerprints,
  ProjectTreeWatcher,
  BuildRunner,
  parseBuildErrors,
} from "./index.ts";

describe("Milestone M16 — Preview Pipeline, Fingerprinting & Watcher", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-preview-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("fingerprintFiles and diffFingerprints accurately track added, modified, and deleted files", async () => {
    // 1. Initial files
    const file1 = path.join(tempDir, "file1.ts");
    const file2 = path.join(tempDir, "file2.ts");
    fs.writeFileSync(file1, "const a = 1;", "utf-8");
    fs.writeFileSync(file2, "const b = 2;", "utf-8");

    const before = await fingerprintFiles(tempDir);
    expect(before.size).toBe(2);
    expect(before.has("file1.ts")).toBe(true);
    expect(before.has("file2.ts")).toBe(true);

    // 2. Perform changes: add file3, modify file1, delete file2
    const file3 = path.join(tempDir, "file3.ts");
    fs.writeFileSync(file3, "const c = 3;", "utf-8");
    fs.writeFileSync(file1, "const a = 999;", "utf-8");
    fs.unlinkSync(file2);

    const after = await fingerprintFiles(tempDir);
    const diff = diffFingerprints(before, after);

    expect(diff.added).toEqual(["file3.ts"]);
    expect(diff.modified).toEqual(["file1.ts"]);
    expect(diff.deleted).toEqual(["file2.ts"]);
  });

  it("ProjectTreeWatcher debounces rapid bursts of filesystem changes into a single batch", async () => {
    const watcher = new ProjectTreeWatcher(tempDir, [".ts"], 80);
    await watcher.start();

    let changeEventCount = 0;
    let lastDiff: any = null;

    watcher.onChange((diff) => {
      changeEventCount += 1;
      lastDiff = diff;
    });

    // Fire 10 rapid file writes within 20ms
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tempDir, `burst-${i}.ts`), `content ${i}`);
      watcher.scheduleCheck();
    }

    // Wait for the 80ms debounce window to settle
    await new Promise((r) => setTimeout(r, 160));

    expect(changeEventCount).toBe(1);
    expect(lastDiff.added.length).toBe(10);

    watcher.dispose();
  });

  it("BuildRunner provides authoritative preview configuration and URLs per framework", () => {
    const rnPreview = BuildRunner.getPreviewInfo("react-native", 8081);
    expect(rnPreview.previewAvailable).toBe(true);
    expect(rnPreview.mode).toBe("device-frame");
    expect(rnPreview.url).toBe("http://localhost:8081");

    const flutterPreview = BuildRunner.getPreviewInfo("flutter", 8080);
    expect(flutterPreview.previewAvailable).toBe(true);
    expect(flutterPreview.mode).toBe("device-frame");

    const webPreview = BuildRunner.getPreviewInfo("website", 5173);
    expect(webPreview.previewAvailable).toBe(true);
    expect(webPreview.mode).toBe("browser");
    expect(webPreview.url).toBe("http://localhost:5173");

    const blankPreview = BuildRunner.getPreviewInfo("blank");
    expect(blankPreview.previewAvailable).toBe(false);
    expect(blankPreview.mode).toBe("none");
    expect(blankPreview.message).toContain("Preview not available for Blank projects");
  });

  it("parseBuildErrors extracts structured compiler errors with file, line, and message", () => {
    const rawCompilerOutput = `
src/App.tsx(14,7): error TS2322: Type 'number' is not assignable to type 'string'.
src/components/Card.tsx(22,10): error TS2304: Cannot find name 'missingVar'.
`;

    const errors = parseBuildErrors(rawCompilerOutput);
    expect(errors.length).toBe(2);
    expect(errors[0].file).toBe("src/App.tsx");
    expect(errors[0].line).toBe(14);
    expect(errors[0].message).toContain("Type 'number' is not assignable to type 'string'");

    expect(errors[1].file).toBe("src/components/Card.tsx");
    expect(errors[1].line).toBe(22);
    expect(errors[1].message).toContain("Cannot find name 'missingVar'");
  });
});
