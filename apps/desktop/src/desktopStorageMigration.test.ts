import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";

import {
  acknowledgeCaideStorageSnapshot,
  readCaideStorageSnapshot,
  saveCaideStorageSnapshot,
  CAIDE_STORAGE_SNAPSHOT_MAX_BYTES,
  validateCaideStorageSnapshot,
} from "./desktopStorageMigration";

const snapshot = (exportedAt = "2026-07-09T00:00:00.000Z") => ({
  version: 1 as const,
  exportedAt,
  entries: {
    "caide:theme": "dark",
    "caide.openUsage.enabled": "true",
  },
});

describe("desktopStorageMigration", () => {
  it("round-trips atomically and acknowledges the snapshot", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "caide-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await expect(saveCaideStorageSnapshot(target, snapshot())).resolves.toBe(true);
      expect(readCaideStorageSnapshot(target)).toEqual(snapshot());
      expect(FS.readdirSync(directory)).toEqual(["snapshot.json"]);

      await acknowledgeCaideStorageSnapshot(target);
      expect(readCaideStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed, disallowed, and oversized snapshots", () => {
    expect(validateCaideStorageSnapshot({ version: 1 })).toBeNull();
    expect(
      validateCaideStorageSnapshot({
        ...snapshot(),
        entries: { "foreign:theme": "dark" },
      }),
    ).toBeNull();
    expect(
      validateCaideStorageSnapshot({
        ...snapshot(),
        entries: { "caide:large": "x".repeat(CAIDE_STORAGE_SNAPSHOT_MAX_BYTES) },
      }),
    ).toBeNull();
  });

  it("accepts renderer snapshots containing large composer drafts", () => {
    const largeDraft = "x".repeat(2 * 1024 * 1024);

    expect(
      validateCaideStorageSnapshot({
        ...snapshot(),
        entries: { "caide:composer-drafts:v1": largeDraft },
      })?.entries["caide:composer-drafts:v1"],
    ).toBe(largeDraft);
  });

  it("does not replace a newer snapshot with an older export", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "caide-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await saveCaideStorageSnapshot(target, snapshot("2026-07-09T01:00:00.000Z"));
      await expect(
        saveCaideStorageSnapshot(target, snapshot("2026-07-09T00:00:00.000Z")),
      ).resolves.toBe(false);
      expect(readCaideStorageSnapshot(target)?.exportedAt).toBe("2026-07-09T01:00:00.000Z");
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats missing and malformed files as absent", () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "caide-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      expect(readCaideStorageSnapshot(target)).toBeNull();
      FS.writeFileSync(target, "not json");
      expect(readCaideStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });
});
