import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  listDesignReferences,
  saveDesignReference,
  deleteDesignReference,
  getDesignReference,
} from "../../dyad/design/references.ts";
import { checkReferencesTool } from "./coreTools.ts";

describe("Design References & check_references tool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "caide-ref-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("lists empty references when none uploaded, with hint not to stop", async () => {
    const refs = await listDesignReferences(tmpDir);
    expect(refs).toEqual([]);

    const mockCtx = { appPath: tmpDir } as any;
    const result = (await checkReferencesTool.execute({}, mockCtx)) as any;
    expect(result.count).toBe(0);
    expect(result.references).toEqual([]);
    expect(result.hint).toContain("do NOT stop, pause, or ask the user for references");
  });

  it("saves and retrieves a design reference with description and image data", async () => {
    const item = {
      id: "ref_123",
      name: "landing-hero.png",
      description: "Dark mode hero mockup with purple gradient accent",
      type: "image" as const,
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      size: 68,
      addedAt: Date.now(),
    };

    const saved = await saveDesignReference(tmpDir, item);
    expect(saved.id).toBe("ref_123");
    expect(saved.filePath).toBeDefined();

    // Verify file exists on disk
    const diskFile = path.resolve(tmpDir, saved.filePath!);
    expect(fsSync.existsSync(diskFile)).toBe(true);

    // Verify list returns it
    const list = await listDesignReferences(tmpDir);
    expect(list.length).toBe(1);
    expect(list[0]!.description).toBe("Dark mode hero mockup with purple gradient accent");

    // Verify check_references tool lists it
    const mockCtx = { appPath: tmpDir } as any;
    const toolList = (await checkReferencesTool.execute({}, mockCtx)) as any;
    expect(toolList.count).toBe(1);
    expect(toolList.references[0].name).toBe("landing-hero.png");
    expect(toolList.references[0].description).toBe(
      "Dark mode hero mockup with purple gradient accent",
    );

    // Verify check_references with referenceId returns full details
    const toolDetail = (await checkReferencesTool.execute(
      { referenceId: "ref_123" },
      mockCtx,
    )) as any;
    expect(toolDetail.found).toBe(true);
    expect(toolDetail.reference.name).toBe("landing-hero.png");
    expect(toolDetail.reference.description).toBe(
      "Dark mode hero mockup with purple gradient accent",
    );
  });

  it("deletes a design reference and removes disk file", async () => {
    const item = {
      id: "ref_delete_me",
      name: "style-guide.txt",
      description: "Color tokens",
      type: "document" as const,
      dataUrl: "data:text/plain;base64,cHJpbWFyeTogIzBhMGExMA==",
      size: 20,
      addedAt: Date.now(),
    };

    const saved = await saveDesignReference(tmpDir, item);
    expect(fsSync.existsSync(path.resolve(tmpDir, saved.filePath!))).toBe(true);

    const deleted = await deleteDesignReference(tmpDir, "ref_delete_me");
    expect(deleted).toBe(true);

    const list = await listDesignReferences(tmpDir);
    expect(list.length).toBe(0);
    expect(fsSync.existsSync(path.resolve(tmpDir, saved.filePath!))).toBe(false);
  });
});
