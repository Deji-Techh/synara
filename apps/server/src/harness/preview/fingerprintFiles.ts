import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface FingerprintDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function fingerprintFiles(
  dir: string,
  extensions?: readonly string[],
): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();

  async function walk(current: string) {
    if (!fs.existsSync(current)) return;
    const entries = await fs.promises.readdir(current, { withFileTypes: true });

    for (const e of entries) {
      if (
        e.name === "node_modules" ||
        e.name === ".git" ||
        e.name === "dist" ||
        e.name === ".expo" ||
        e.name === ".dart_tool"
      ) {
        continue;
      }

      const full = path.join(current, e.name);
      const rel = path.relative(dir, full);

      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        if (!extensions || extensions.length === 0 || extensions.some((ext) => rel.endsWith(ext))) {
          try {
            const hash = computeFileHash(full);
            fileMap.set(rel, hash);
          } catch {
            // ignore unreadable file
          }
        }
      }
    }
  }

  await walk(dir);
  return fileMap;
}

export function diffFingerprints(
  before: Map<string, string>,
  after: Map<string, string>,
): FingerprintDiff {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [file, hash] of after.entries()) {
    const beforeHash = before.get(file);
    if (!beforeHash) {
      added.push(file);
    } else if (beforeHash !== hash) {
      modified.push(file);
    }
  }

  for (const file of before.keys()) {
    if (!after.has(file)) {
      deleted.push(file);
    }
  }

  return { added, modified, deleted };
}
