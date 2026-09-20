// FILE: references.ts
// Purpose: Persistent storage and retrieval of project design references
// (mockups, screenshots, style guides, tokens) in .caide/references.
// Layer: Server design engine

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

export interface DesignReferenceItem {
  id: string;
  name: string;
  description?: string;
  type: "image" | "document";
  dataUrl?: string;
  filePath?: string;
  size?: number;
  addedAt: number;
}

function referencesDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".caide", "references");
}

function manifestPath(workspaceRoot: string): string {
  return path.join(referencesDir(workspaceRoot), "references.json");
}

async function ensureDir(dir: string): Promise<void> {
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function listDesignReferences(workspaceRoot: string): Promise<DesignReferenceItem[]> {
  try {
    const file = manifestPath(workspaceRoot);
    if (!fsSync.existsSync(file)) return [];
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as DesignReferenceItem[];
    }
  } catch {
    // ignore parse or missing errors
  }
  return [];
}

export async function saveDesignReference(
  workspaceRoot: string,
  item: DesignReferenceItem,
): Promise<DesignReferenceItem> {
  const dir = referencesDir(workspaceRoot);
  await ensureDir(dir);

  const current = await listDesignReferences(workspaceRoot);
  const existingIdx = current.findIndex((r) => r.id === item.id);

  let updatedItem = { ...item };

  // If dataUrl is a base64 payload, extract and persist raw file to disk
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    try {
      const match = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        const mimeType = match[1];
        const base64Data = match[2];
        const ext = mimeType.split("/")[1] || (item.type === "image" ? "png" : "txt");
        const safeName = item.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${item.id}_${safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`}`;
        const diskPath = path.join(dir, filename);
        await fs.writeFile(diskPath, Buffer.from(base64Data, "base64"));
        updatedItem.filePath = path.join(".caide", "references", filename);
      }
    } catch {
      // keep without disk write if failed
    }
  }

  if (existingIdx >= 0) {
    current[existingIdx] = updatedItem;
  } else {
    current.unshift(updatedItem);
  }

  await fs.writeFile(manifestPath(workspaceRoot), JSON.stringify(current, null, 2), "utf-8");
  return updatedItem;
}

export async function deleteDesignReference(workspaceRoot: string, id: string): Promise<boolean> {
  const dir = referencesDir(workspaceRoot);
  const current = await listDesignReferences(workspaceRoot);
  const target = current.find((r) => r.id === id);
  if (!target) return false;

  const remaining = current.filter((r) => r.id !== id);
  await fs.writeFile(manifestPath(workspaceRoot), JSON.stringify(remaining, null, 2), "utf-8");

  if (target.filePath) {
    try {
      const fullPath = path.resolve(workspaceRoot, target.filePath);
      if (fsSync.existsSync(fullPath)) {
        await fs.unlink(fullPath);
      }
    } catch {
      // ignore unlink errors
    }
  }

  return true;
}

export async function getDesignReference(
  workspaceRoot: string,
  idOrName: string,
): Promise<DesignReferenceItem | null> {
  const current = await listDesignReferences(workspaceRoot);
  const needle = idOrName.trim().toLowerCase();
  const match = current.find(
    (r) =>
      r.id.toLowerCase() === needle ||
      r.name.toLowerCase() === needle ||
      r.name.toLowerCase().includes(needle),
  );
  return match ?? null;
}
