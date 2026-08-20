import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import type { ReferenceEntry } from "@/ipc/types/reference";

const logger = log.scope("reference_store");

function getReferenceDir(chatId: number, appPath?: string): string {
  const base = appPath ? path.join(appPath, ".caide") : path.join(process.cwd(), ".caide");
  return path.join(base, "references", String(chatId));
}

function getMetadataPath(refDir: string): string {
  return path.join(refDir, ".metadata.json");
}

function loadMetadata(refDir: string): ReferenceEntry[] {
  try {
    const metaPath = getMetadataPath(refDir);
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
  } catch (err) {
    logger.warn("Failed to load reference metadata", err);
  }
  return [];
}

function saveMetadata(refDir: string, entries: ReferenceEntry[]): void {
  try {
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(getMetadataPath(refDir), JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    logger.error("Failed to save reference metadata", err);
    throw err;
  }
}

function uniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName;
  let idx = 1;
  while (existingNames.has(`${baseName}_${idx}`)) {
    idx++;
  }
  return `${baseName}_${idx}`;
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

export function addReference(chatId: number, paths: string[], appPath?: string): ReferenceEntry[] {
  const refDir = getReferenceDir(chatId, appPath);
  fs.mkdirSync(refDir, { recursive: true });

  const existing = loadMetadata(refDir);
  const existingNames = new Set(existing.map((e) => e.name));

  const newEntries: ReferenceEntry[] = [];

  for (const srcPath of paths) {
    if (!fs.existsSync(srcPath)) {
      logger.warn("Reference path does not exist", srcPath);
      continue;
    }
    const base = path.basename(srcPath);
    const name = uniqueName(base, existingNames);
    existingNames.add(name);
    const destPath = path.join(refDir, name);
    try {
      copyRecursive(srcPath, destPath);
      newEntries.push({
        originalPath: srcPath,
        referencePath: destPath,
        name,
      });
    } catch (err) {
      logger.error("Failed to copy reference", srcPath, err);
    }
  }

  const allEntries = [...existing, ...newEntries];
  saveMetadata(refDir, allEntries);
  return newEntries;
}

export function listReferences(chatId: number, appPath?: string): ReferenceEntry[] {
  const refDir = getReferenceDir(chatId, appPath);
  if (!fs.existsSync(refDir)) return [];
  return loadMetadata(refDir);
}

export function removeReference(chatId: number, referencePath: string, appPath?: string): void {
  const refDir = getReferenceDir(chatId, appPath);
  const entries = loadMetadata(refDir);
  const idx = entries.findIndex((e) => e.referencePath === referencePath);
  if (idx === -1) return;

  const [removed] = entries.splice(idx, 1);
  const absPath = removed.referencePath;
  if (fs.existsSync(absPath)) {
    fs.rmSync(absPath, { recursive: true, force: true });
  }
  saveMetadata(refDir, entries);
}
