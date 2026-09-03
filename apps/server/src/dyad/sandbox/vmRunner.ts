// FILE: vmRunner.ts
// Purpose: In-process JS-subset sandbox on node:vm. No require/process/
// fetch/globals — scripts act only through injected async host functions.
// CPU/loops are bounded by the vm timeout; wall-clock by the caller.
// This is the "main thread" runner; worker-thread offload lands in M4.

import * as fs from "node:fs";
import * as path from "node:path";
import vm from "node:vm";
import { safeJoinAppPath } from "../editing/safePath.ts";
import { SANDBOX_READ_FILE_LIMIT_BYTES } from "./limits.ts";

export interface SandboxHost {
  read_file(path: string): Promise<string>;
  list_files(dir?: string): Promise<string[]>;
  grep(pattern: string, dir?: string): Promise<string[]>;
}

export function createFsHosts(appPath: string): SandboxHost {
  return {
    async read_file(p: string): Promise<string> {
      const full = safeJoinAppPath(appPath, p);
      const stat = fs.statSync(full);
      if (!stat.isFile()) throw new Error(`Not a file: ${p}`);
      if (stat.size > SANDBOX_READ_FILE_LIMIT_BYTES) {
        throw new Error(`File too large for sandbox read (${stat.size} bytes): ${p}`);
      }
      return fs.promises.readFile(full, "utf8");
    },
    async list_files(dir = "."): Promise<string[]> {
      const full = safeJoinAppPath(appPath, dir);
      return (await fs.promises.readdir(full)).sort();
    },
    async grep(pattern: string, dir = "."): Promise<string[]> {
      const root = safeJoinAppPath(appPath, dir);
      const hits: string[] = [];
      const re = new RegExp(pattern);
      async function walk(current: string): Promise<void> {
        if (hits.length >= 50) return;
        const entries = await fs.promises.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          if (hits.length >= 50) return;
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|md|css|dart|py|go|rs)$/.test(entry.name)) {
            try {
              const text = await fs.promises.readFile(full, "utf8");
              const lines = text.split("\n");
              lines.forEach((line, i) => {
                if (hits.length < 50 && re.test(line)) {
                  hits.push(`${path.relative(root, full)}:${i + 1}: ${line.trim().slice(0, 160)}`);
                }
              });
            } catch {
              // unreadable — skip
            }
          }
        }
      }
      await walk(root);
      return hits;
    },
  };
}

export interface VmRunResult {
  /** Value of `result = <expr>` / returned promise, JSON-cloned. */
  result: unknown;
  /** console.log lines captured during the run. */
  logs: string[];
}

/**
 * Run user script with only the given host functions in scope. The script
 * may be async (top-level await supported); `result` sets the return value.
 * Throws on timeout (infinite loops) or host errors.
 */
export async function runInVm(
  script: string,
  hosts: Record<string, (...args: any[]) => Promise<unknown>>,
  timeoutMs: number,
): Promise<VmRunResult> {
  const logs: string[] = [];
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => safeStringify(a)).join(" "));
      },
    },
    ...hosts,
  };
  const context = vm.createContext(sandbox);
  const wrapped = `(async () => {\nlet result;\n${script}\nreturn result;\n})()`;
  const started = Date.now();
  try {
    const out = (await vm.runInContext(wrapped, context, { timeout: timeoutMs })) as unknown;
    void started;
    return { result: jsonClone(out), logs };
  } catch (err) {
    if (err instanceof Error && /Script execution timed out/i.test(err.message)) {
      throw new Error(`Sandbox script timed out after ${timeoutMs}ms (infinite loop?)`);
    }
    throw err;
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function jsonClone(value: unknown): unknown {
  try {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  } catch {
    return safeStringify(value);
  }
}
